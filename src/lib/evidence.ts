/**
 * Evidence System — Standardized format for bounty acceptance verification
 * 
 * Provides:
 * - Structured evidence reports from harness execution
 * - Validation against acceptance criteria
 * - Standard predicates for common verification types
 */

import * as crypto from 'crypto';
import type { BountySpec } from './bounty-graph';

// ============================================================================
// Type Definitions
// ============================================================================

export interface EvidenceReport {
  version: string;
  sandbox_id: string;
  bounty_id?: string;
  commit_hash?: string;
  harness_version: string;
  timestamp: string;
  
  // Results
  passed_items: string[];
  failed_items: string[];
  metric_values: Record<string, number>;
  
  // Artifacts & verification
  artifact_hashes: Array<{
    path: string;
    hash: string;
    algorithm: 'sha256';
  }>;
  
  // Raw output
  raw_output?: string;
}

export interface PredicateResult {
  predicate: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  message?: string;
}

export interface ValidationResult {
  valid: boolean;
  passed_predicates: PredicateResult[];
  failed_predicates: PredicateResult[];
  summary: string;
}

// ============================================================================
// Evidence Report Creation
// ============================================================================

export interface CreateEvidenceOptions {
  harnessOutput: string;
  sandboxId: string;
  bountySpec: BountySpec;
  bountyId?: string;
  commitHash?: string;
  artifactPaths?: string[];
}

/**
 * Create standardized evidence report from harness output
 */
export async function createEvidenceReport(
  options: CreateEvidenceOptions
): Promise<EvidenceReport> {
  const {
    harnessOutput,
    sandboxId,
    bountySpec,
    bountyId,
    commitHash,
    artifactPaths = [],
  } = options;

  // Parse harness output to extract passed/failed items
  const { passedItems, failedItems, metricValues } = parseHarnessOutput(harnessOutput);

  // Calculate artifact hashes
  const artifactHashes: EvidenceReport['artifact_hashes'] = [];
  // TODO: In production, actually hash the artifact files
  // For now, just record the paths
  for (const artifactPath of artifactPaths) {
    artifactHashes.push({
      path: artifactPath,
      hash: crypto.createHash('sha256').update(artifactPath).digest('hex'),
      algorithm: 'sha256',
    });
  }

  return {
    version: '1.0',
    sandbox_id: sandboxId,
    bounty_id: bountyId,
    commit_hash: commitHash,
    harness_version: bountySpec.version,
    timestamp: new Date().toISOString(),
    passed_items: passedItems,
    failed_items: failedItems,
    metric_values: metricValues,
    artifact_hashes: artifactHashes,
    raw_output: harnessOutput,
  };
}

/**
 * Parse harness output to extract test results and metrics
 */
function parseHarnessOutput(output: string): {
  passedItems: string[];
  failedItems: string[];
  metricValues: Record<string, number>;
} {
  const passedItems: string[] = [];
  const failedItems: string[] = [];
  const metricValues: Record<string, number> = {};

  // Split by sections (delimiter: ---)
  const sections = output.split(/\n---\n/);

  for (const section of sections) {
    // Look for [PASS] or [FAIL] markers
    const passMatch = section.match(/\[PASS\]\s+(.+?)(?:\s+\(|$)/);
    if (passMatch) {
      passedItems.push(passMatch[1].trim());
    }

    const failMatch = section.match(/\[FAIL\]\s+(.+?)(?:\s+\(|$)/);
    if (failMatch) {
      failedItems.push(failMatch[1].trim());
    }

    // Extract metrics (format: "metric_name: 123.45")
    const metricMatches = section.matchAll(/([a-z_][a-z0-9_]*?):\s*([0-9.]+)/gi);
    for (const match of metricMatches) {
      const metricName = match[1].toLowerCase();
      const metricValue = parseFloat(match[2]);
      if (!isNaN(metricValue)) {
        metricValues[metricName] = metricValue;
      }
    }
  }

  return { passedItems, failedItems, metricValues };
}

// ============================================================================
// Validation Against Acceptance Criteria
// ============================================================================

/**
 * Validate evidence against acceptance criteria from bounty spec
 */
export function validateEvidence(
  evidence: EvidenceReport,
  bountySpec: BountySpec
): ValidationResult {
  const predicates: PredicateResult[] = [];

  // Collect all acceptance criteria from nodes
  for (const [nodeId, node] of Object.entries(bountySpec.nodes)) {
    const harness = node.harness || node.verification;
    if (!harness?.checks) continue;

    for (const check of harness.checks) {
      const checkName = check.name;
      
      // Check if this check passed
      const passed = evidence.passed_items.includes(checkName);
      
      predicates.push({
        predicate: `check:${nodeId}:${checkName}`,
        passed,
        message: passed ? `Check '${checkName}' passed` : `Check '${checkName}' failed`,
      });

      // Validate pass criteria
      if (check.pass_criteria) {
        const criteria = check.pass_criteria;

        // Min pass rate
        if (criteria.min_pass_rate !== undefined) {
          const passRate = evidence.metric_values['pass_rate'] || 0;
          const passed = passRate >= criteria.min_pass_rate;
          
          predicates.push({
            predicate: `pass_rate_gte:${criteria.min_pass_rate}`,
            passed,
            actual: passRate,
            expected: criteria.min_pass_rate,
            message: `Pass rate: ${passRate.toFixed(2)} (required: ${criteria.min_pass_rate})`,
          });
        }

        // Metric thresholds
        if (criteria.metric) {
          const metricValue = evidence.metric_values[criteria.metric];
          
          if (criteria.min !== undefined) {
            const passed = metricValue !== undefined && metricValue >= criteria.min;
            predicates.push({
              predicate: `${criteria.metric}_gte:${criteria.min}`,
              passed,
              actual: metricValue,
              expected: criteria.min,
              message: `${criteria.metric}: ${metricValue} (min: ${criteria.min})`,
            });
          }

          if (criteria.max !== undefined) {
            const passed = metricValue !== undefined && metricValue <= criteria.max;
            predicates.push({
              predicate: `${criteria.metric}_lte:${criteria.max}`,
              passed,
              actual: metricValue,
              expected: criteria.max,
              message: `${criteria.metric}: ${metricValue} (max: ${criteria.max})`,
            });
          }
        }
      }
    }
  }

  // Standard predicates
  const standardPredicates = evaluateStandardPredicates(evidence);
  predicates.push(...standardPredicates);

  const passedPredicates = predicates.filter(p => p.passed);
  const failedPredicates = predicates.filter(p => !p.passed);
  const allPassed = failedPredicates.length === 0;

  return {
    valid: allPassed,
    passed_predicates: passedPredicates,
    failed_predicates: failedPredicates,
    summary: allPassed
      ? `All ${predicates.length} acceptance criteria passed`
      : `${failedPredicates.length} of ${predicates.length} criteria failed`,
  };
}

/**
 * Evaluate standard predicates
 */
function evaluateStandardPredicates(evidence: EvidenceReport): PredicateResult[] {
  const predicates: PredicateResult[] = [];

  // tests_passed — at least one test passed, no tests failed
  predicates.push({
    predicate: 'tests_passed',
    passed: evidence.passed_items.length > 0 && evidence.failed_items.length === 0,
    actual: {
      passed: evidence.passed_items.length,
      failed: evidence.failed_items.length,
    },
    message: `${evidence.passed_items.length} passed, ${evidence.failed_items.length} failed`,
  });

  // coverage_gte(X) — if coverage metric exists
  if (evidence.metric_values['coverage'] !== undefined) {
    const coverage = evidence.metric_values['coverage'];
    const threshold = 80; // default
    predicates.push({
      predicate: `coverage_gte:${threshold}`,
      passed: coverage >= threshold,
      actual: coverage,
      expected: threshold,
      message: `Coverage: ${coverage.toFixed(1)}% (required: ${threshold}%)`,
    });
  }

  // lint_clean — no lint errors
  if (evidence.metric_values['lint_errors'] !== undefined) {
    const lintErrors = evidence.metric_values['lint_errors'];
    predicates.push({
      predicate: 'lint_clean',
      passed: lintErrors === 0,
      actual: lintErrors,
      expected: 0,
      message: `Lint errors: ${lintErrors}`,
    });
  }

  // benchmark predicates
  if (evidence.metric_values['bench_p95'] !== undefined) {
    const p95 = evidence.metric_values['bench_p95'];
    const threshold = evidence.metric_values['bench_p95_threshold'] || 1000;
    predicates.push({
      predicate: `bench_p95_lte:${threshold}`,
      passed: p95 <= threshold,
      actual: p95,
      expected: threshold,
      message: `P95 latency: ${p95}ms (max: ${threshold}ms)`,
    });
  }

  // DRC (Design Rule Check) for hardware
  if (evidence.metric_values['drc_errors'] !== undefined) {
    const drcErrors = evidence.metric_values['drc_errors'];
    predicates.push({
      predicate: 'drc_errors_eq:0',
      passed: drcErrors === 0,
      actual: drcErrors,
      expected: 0,
      message: `DRC errors: ${drcErrors}`,
    });
  }

  return predicates;
}

// ============================================================================
// Predicate Helpers
// ============================================================================

/**
 * Parse a predicate string into structured form
 * 
 * Examples:
 * - "tests_passed" → { type: "tests_passed" }
 * - "coverage_gte:80" → { type: "coverage_gte", value: 80 }
 * - "bench_p95_lte:1000" → { type: "bench_p95_lte", value: 1000 }
 */
export function parsePredicate(predicate: string): {
  type: string;
  metric?: string;
  operator?: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
  value?: number;
} {
  // Format: metric_operator:value or just predicate_name
  const match = predicate.match(/^([a-z_]+?)(?:_(gte|lte|eq|gt|lt))?(?::(\d+(?:\.\d+)?))?$/);
  
  if (!match) {
    return { type: predicate };
  }

  return {
    type: predicate,
    metric: match[1],
    operator: match[2] as any,
    value: match[3] ? parseFloat(match[3]) : undefined,
  };
}

/**
 * Generate human-readable description of a predicate
 */
export function describePredicateType(predicateType: string): string {
  const descriptions: Record<string, string> = {
    tests_passed: 'All tests must pass',
    lint_clean: 'No linting errors',
    'drc_errors_eq:0': 'No design rule check errors',
  };

  if (descriptions[predicateType]) {
    return descriptions[predicateType];
  }

  // Try to parse and describe
  const parsed = parsePredicate(predicateType);
  if (parsed.operator && parsed.value !== undefined) {
    const opText = {
      gte: '≥',
      lte: '≤',
      eq: '=',
      gt: '>',
      lt: '<',
    }[parsed.operator];
    
    return `${parsed.metric} ${opText} ${parsed.value}`;
  }

  return predicateType;
}
