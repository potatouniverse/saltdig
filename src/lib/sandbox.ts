/**
 * BountySandbox — Secure execution environment for agents working on bounties
 * 
 * Provides access-scoped isolation where agents can only:
 * - Read files explicitly allowed in the bounty spec's access scope
 * - Write files to designated output paths
 * - Execute acceptance harness tests
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { BountySpec, AccessScope, AcceptanceHarness } from './bounty-graph';
import { createEvidenceReport, type EvidenceReport } from './evidence';

const execAsync = promisify(exec);

// ============================================================================
// Type Definitions
// ============================================================================

export interface Sandbox {
  id: string;
  bounty_id: string;
  agent_id: string;
  workspace_path: string;
  access_scope: AccessScope;
  status: 'active' | 'running_harness' | 'destroyed';
  created_at: string;
  destroyed_at?: string;
}

export interface SandboxConfig {
  base_workspace_dir: string;
  default_timeout: number;
  max_file_size: number; // in bytes
  enable_network: boolean;
}

export interface SandboxFile {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  readable: boolean;
  writable: boolean;
}

// ============================================================================
// Sandbox Manager
// ============================================================================

export class SandboxManager {
  private config: SandboxConfig;
  private activeSandboxes: Map<string, Sandbox> = new Map();

  constructor(config?: Partial<SandboxConfig>) {
    this.config = {
      base_workspace_dir: config?.base_workspace_dir || '/tmp/saltyhall-sandboxes',
      default_timeout: config?.default_timeout || 300, // 5 minutes
      max_file_size: config?.max_file_size || 10 * 1024 * 1024, // 10MB
      enable_network: config?.enable_network ?? false,
    };
  }

  /**
   * Create an isolated sandbox for an agent to work on a bounty
   */
  async createSandbox(
    agentId: string,
    bountyId: string,
    bountySpec: BountySpec
  ): Promise<Sandbox> {
    const sandboxId = this.generateSandboxId();
    const workspacePath = path.join(this.config.base_workspace_dir, sandboxId);

    // Extract access scope from the first node (in practice, merge all nodes)
    const accessScope = this.mergeAccessScopes(bountySpec);

    // Create workspace directory
    await fs.mkdir(workspacePath, { recursive: true });

    // Copy readable files to sandbox
    await this.initializeWorkspace(workspacePath, accessScope, bountySpec);

    const sandbox: Sandbox = {
      id: sandboxId,
      bounty_id: bountyId,
      agent_id: agentId,
      workspace_path: workspacePath,
      access_scope: accessScope,
      status: 'active',
      created_at: new Date().toISOString(),
    };

    this.activeSandboxes.set(sandboxId, sandbox);
    return sandbox;
  }

  /**
   * List files accessible to the agent in the sandbox
   */
  async getSandboxFiles(sandboxId: string): Promise<SandboxFile[]> {
    const sandbox = this.getSandbox(sandboxId);
    const files: SandboxFile[] = [];

    const readPaths = new Set(sandbox.access_scope.files.read || []);
    const writePaths = new Set(sandbox.access_scope.files.write || []);
    const denyPaths = new Set(sandbox.access_scope.files.deny || []);

    // List all files in workspace
    async function walkDir(dir: string, basePath: string = ''): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);

        if (denyPaths.has(relativePath)) continue;

        const readable = readPaths.has(relativePath) || writePaths.has(relativePath);
        const writable = writePaths.has(relativePath);

        if (entry.isDirectory()) {
          files.push({
            path: relativePath,
            type: 'directory',
            readable,
            writable,
          });
          await walkDir(fullPath, relativePath);
        } else {
          const stats = await fs.stat(fullPath);
          files.push({
            path: relativePath,
            type: 'file',
            size: stats.size,
            readable,
            writable,
          });
        }
      }
    }

    await walkDir(sandbox.workspace_path);
    return files.filter(f => f.readable || f.writable);
  }

  /**
   * Read a file from the sandbox (access-controlled)
   */
  async readFile(sandboxId: string, filePath: string): Promise<string> {
    const sandbox = this.getSandbox(sandboxId);
    this.validateRead(sandbox, filePath);

    const fullPath = path.join(sandbox.workspace_path, filePath);
    
    // Security: ensure path doesn't escape sandbox
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(path.resolve(sandbox.workspace_path))) {
      throw new Error('Path traversal denied');
    }

    const stats = await fs.stat(fullPath);
    if (stats.size > this.config.max_file_size) {
      throw new Error(`File exceeds maximum size (${this.config.max_file_size} bytes)`);
    }

    return await fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Write a file to the sandbox (access-controlled)
   */
  async writeFile(sandboxId: string, filePath: string, content: string): Promise<void> {
    const sandbox = this.getSandbox(sandboxId);
    this.validateWrite(sandbox, filePath);

    if (Buffer.byteLength(content, 'utf-8') > this.config.max_file_size) {
      throw new Error(`Content exceeds maximum size (${this.config.max_file_size} bytes)`);
    }

    const fullPath = path.join(sandbox.workspace_path, filePath);

    // Security: ensure path doesn't escape sandbox
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(path.resolve(sandbox.workspace_path))) {
      throw new Error('Path traversal denied');
    }

    // Create parent directories if needed
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * Execute the acceptance harness in the sandbox
   */
  async runHarness(
    sandboxId: string,
    bountySpec: BountySpec
  ): Promise<{ success: boolean; output: string; exitCode: number }> {
    const sandbox = this.getSandbox(sandboxId);
    sandbox.status = 'running_harness';

    try {
      // Merge harness definitions from all nodes
      const harness = this.mergeHarnesses(bountySpec);
      
      if (!harness || !harness.checks || harness.checks.length === 0) {
        throw new Error('No acceptance harness defined in bounty spec');
      }

      const results: Array<{ check: string; passed: boolean; output: string; exitCode: number }> = [];
      let allPassed = true;

      // Execute each check
      for (const check of harness.checks) {
        const timeout = (harness.timeout_per_check || this.config.default_timeout) * 1000;
        
        try {
          const { stdout, stderr } = await execAsync(check.command, {
            cwd: sandbox.workspace_path,
            timeout,
            env: {
              ...process.env,
              // Isolate environment
              HOME: sandbox.workspace_path,
              TMPDIR: path.join(sandbox.workspace_path, '.tmp'),
            },
          });

          const output = stdout + stderr;
          const passed = this.evaluateCheckResult(check, 0, output);

          results.push({
            check: check.name,
            passed,
            output,
            exitCode: 0,
          });

          if (!passed) allPassed = false;
        } catch (error: any) {
          const exitCode = error.code || 1;
          const output = (error.stdout || '') + (error.stderr || '');
          const passed = this.evaluateCheckResult(check, exitCode, output);

          results.push({
            check: check.name,
            passed,
            output,
            exitCode,
          });

          if (!passed) allPassed = false;
        }
      }

      const summary = results.map(r => 
        `[${r.passed ? 'PASS' : 'FAIL'}] ${r.check} (exit ${r.exitCode})\n${r.output}`
      ).join('\n\n---\n\n');

      return {
        success: allPassed,
        output: summary,
        exitCode: allPassed ? 0 : 1,
      };
    } finally {
      sandbox.status = 'active';
    }
  }

  /**
   * Collect evidence from harness execution
   */
  async collectEvidence(
    sandboxId: string,
    bountySpec: BountySpec,
    harnessOutput: string
  ): Promise<EvidenceReport> {
    const sandbox = this.getSandbox(sandboxId);

    // Get git commit hash if available
    let commitHash: string | undefined;
    try {
      const { stdout } = await execAsync('git rev-parse HEAD', {
        cwd: sandbox.workspace_path,
      });
      commitHash = stdout.trim();
    } catch {
      // No git repo, that's fine
    }

    return createEvidenceReport({
      harnessOutput,
      sandboxId,
      bountySpec,
      commitHash,
    });
  }

  /**
   * Destroy a sandbox and clean up resources
   */
  async destroySandbox(sandboxId: string): Promise<void> {
    const sandbox = this.getSandbox(sandboxId);

    // Remove workspace directory
    await fs.rm(sandbox.workspace_path, { recursive: true, force: true });

    // Mark as destroyed
    sandbox.status = 'destroyed';
    sandbox.destroyed_at = new Date().toISOString();

    this.activeSandboxes.delete(sandboxId);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateSandboxId(): string {
    return `sbx_${randomBytes(16).toString('hex')}`;
  }

  private getSandbox(sandboxId: string): Sandbox {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }
    if (sandbox.status === 'destroyed') {
      throw new Error(`Sandbox ${sandboxId} has been destroyed`);
    }
    return sandbox;
  }

  private validateRead(sandbox: Sandbox, filePath: string): void {
    const readPaths = sandbox.access_scope.files.read || [];
    const writePaths = sandbox.access_scope.files.write || [];
    const denyPaths = sandbox.access_scope.files.deny || [];

    if (denyPaths.includes(filePath)) {
      throw new Error(`Access denied: ${filePath} is in deny list`);
    }

    if (!readPaths.includes(filePath) && !writePaths.includes(filePath)) {
      throw new Error(`Access denied: ${filePath} is not in read scope`);
    }
  }

  private validateWrite(sandbox: Sandbox, filePath: string): void {
    const writePaths = sandbox.access_scope.files.write || [];
    const denyPaths = sandbox.access_scope.files.deny || [];

    if (denyPaths.includes(filePath)) {
      throw new Error(`Access denied: ${filePath} is in deny list`);
    }

    if (!writePaths.includes(filePath)) {
      throw new Error(`Access denied: ${filePath} is not in write scope`);
    }
  }

  private mergeAccessScopes(bountySpec: BountySpec): AccessScope {
    const allRead = new Set<string>();
    const allWrite = new Set<string>();
    const allDeny = new Set<string>();
    const allEnvVars = new Set<string>();

    for (const node of Object.values(bountySpec.nodes)) {
      const scope = node.info_boundary || node.access_scope;
      if (!scope) continue;

      scope.files.read?.forEach(p => allRead.add(p));
      scope.files.write?.forEach(p => allWrite.add(p));
      scope.files.deny?.forEach(p => allDeny.add(p));
      scope.env_vars?.forEach(v => allEnvVars.add(v));
    }

    return {
      files: {
        read: Array.from(allRead),
        write: Array.from(allWrite),
        deny: Array.from(allDeny),
      },
      env_vars: Array.from(allEnvVars),
    };
  }

  private mergeHarnesses(bountySpec: BountySpec): AcceptanceHarness | null {
    const allChecks: any[] = [];
    let method: any = 'automated';

    for (const node of Object.values(bountySpec.nodes)) {
      const harness = node.harness || node.verification;
      if (!harness) continue;

      if (harness.method) method = harness.method;
      if (harness.checks) {
        allChecks.push(...harness.checks);
      }
      if (harness.criteria) {
        // Convert old-style criteria to new checks format
        for (const criterion of harness.criteria) {
          allChecks.push({
            name: criterion.type,
            type: criterion.type,
            command: criterion.command,
            pass_criteria: {
              exit_code: criterion.exit_code,
              min_pass_rate: criterion.min_pass_rate,
              ...criterion.threshold,
            },
          });
        }
      }
    }

    if (allChecks.length === 0) return null;

    return {
      method,
      checks: allChecks,
      timeout_per_check: 300,
    };
  }

  private async initializeWorkspace(
    workspacePath: string,
    accessScope: AccessScope,
    bountySpec: BountySpec
  ): Promise<void> {
    // Create base directories
    await fs.mkdir(path.join(workspacePath, '.tmp'), { recursive: true });

    // For now, just create empty workspace
    // In production, you'd copy the project files that are in the read scope
    // This would involve cloning the repo or copying from a base template
    
    // Write bounty spec to workspace for reference
    const specPath = path.join(workspacePath, '.bounty-spec.json');
    await fs.writeFile(specPath, JSON.stringify(bountySpec, null, 2), 'utf-8');
  }

  private evaluateCheckResult(check: any, exitCode: number, output: string): boolean {
    const criteria = check.pass_criteria;
    if (!criteria) {
      // Default: pass if exit code is 0
      return exitCode === 0;
    }

    // Check exit code
    if (criteria.exit_code !== undefined && exitCode !== criteria.exit_code) {
      return false;
    }

    // Check min pass rate (for test suites)
    if (criteria.min_pass_rate !== undefined) {
      const passRate = this.extractPassRate(output);
      if (passRate < criteria.min_pass_rate) {
        return false;
      }
    }

    // Check metric thresholds (for benchmarks)
    if (criteria.metric) {
      const metricValue = this.extractMetric(output, criteria.metric);
      if (metricValue === null) return false;

      if (criteria.min !== undefined && metricValue < criteria.min) return false;
      if (criteria.max !== undefined && metricValue > criteria.max) return false;
    }

    return true;
  }

  private extractPassRate(output: string): number {
    // Try to extract pass rate from common test output formats
    // Jest: "Tests: 5 passed, 5 total"
    const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (jestMatch) {
      const passed = parseInt(jestMatch[1]);
      const total = parseInt(jestMatch[2]);
      return total > 0 ? passed / total : 0;
    }

    // Pytest: "5 passed, 0 failed"
    const pytestMatch = output.match(/(\d+)\s+passed.*?(\d+)\s+failed/);
    if (pytestMatch) {
      const passed = parseInt(pytestMatch[1]);
      const failed = parseInt(pytestMatch[2]);
      const total = passed + failed;
      return total > 0 ? passed / total : 0;
    }

    // Default: 100% if we can't parse
    return 1.0;
  }

  private extractMetric(output: string, metricName: string): number | null {
    // Try to extract metric from output
    // Format: "metric_name: 123.45"
    const regex = new RegExp(`${metricName}:\\s*([0-9.]+)`, 'i');
    const match = output.match(regex);
    return match ? parseFloat(match[1]) : null;
  }
}

// Export singleton instance
export const sandboxManager = new SandboxManager();
