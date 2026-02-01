/**
 * GID Bounty Subgraph Extract - Core Library
 * 
 * Implements the bounty graph protocol as defined in docs/design/gid-bounty-protocol.md
 */

import * as yaml from 'js-yaml';

// ============================================================================
// Type Definitions
// ============================================================================

export type NodeStatus = 'open' | 'claimed' | 'in_progress' | 'review' | 'done' | 'disputed';
export type NodeType = 'code' | 'test' | 'docs' | 'infra' | 'design';
export type BountyType = 'standard' | 'milestone' | 'competition';
export type VerificationMethod = 'automated' | 'peer_review' | 'benchmark' | 'hybrid';
export type Currency = 'USDC' | 'SALT';

export interface AccessScope {
  files: {
    read: string[];
    write: string[];
    deny?: string[];
  };
  env_vars?: string[];
  apis?: Array<{
    endpoint: string;
    methods?: string[];
    description?: string;
  }>;
  network?: {
    allow?: string[];
    deny?: string[];
  };
}

export interface InfoBoundary extends AccessScope {
  // InfoBoundary is the same as AccessScope for now
  // but may diverge in the future with additional metadata
}

export interface VerificationCriteria {
  type: 'test_suite' | 'type_check' | 'lint' | 'benchmark';
  command: string;
  min_pass_rate?: number;
  exit_code?: number;
  threshold?: {
    metric: string;
    min?: number;
    max?: number;
    direction?: 'maximize' | 'minimize';
  };
}

export interface AcceptanceHarness {
  method: VerificationMethod;
  criteria?: VerificationCriteria[];
  checks?: Array<{
    name: string;
    type: string;
    command: string;
    pass_criteria?: {
      min_pass_rate?: number;
      exit_code?: number;
      metric?: string;
      min?: number;
      max?: number;
      direction?: 'maximize' | 'minimize';
    };
  }>;
  timeout_per_check?: number;
  retries?: number;
  sandbox?: 'docker' | 'firecracker' | 'nsjail';
}

export interface BountyMeta {
  id?: string;
  budget: number;
  currency: Currency;
  deadline: string;
  type: BountyType;
  poster?: string;
  min_reputation?: number;
  tags?: string[];
}

export interface NodeInputs {
  interfaces?: Array<{
    path: string;
    description?: string;
  }>;
  mocks?: Array<{
    path: string;
    description?: string;
  }>;
  test_vectors?: Array<{
    path: string;
    description?: string;
  }>;
  constraints?: string[];
}

export interface NodeOutputs {
  artifacts?: Array<{
    path: string;
    type: 'source' | 'test' | 'docs' | 'config';
  }>;
  deliverable?: 'pull_request' | 'artifact' | 'report';
}

export interface BountyNode {
  type: NodeType;
  status: NodeStatus;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  files?: string[];
  
  // Layer 1: Work Node
  outputs?: NodeOutputs;
  
  // Layer 2: Info Boundary
  inputs?: NodeInputs;
  info_boundary?: InfoBoundary;
  access_scope?: AccessScope; // alias for info_boundary
  
  // Layer 3: Acceptance Harness
  verification?: AcceptanceHarness;
  harness?: AcceptanceHarness; // alias for verification
  
  // Bounty metadata
  bounty?: BountyMeta;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: 'depends_on' | 'relates_to' | 'blocks';
}

export interface GIDGraph {
  version: string;
  project: string;
  nodes: Record<string, BountyNode>;
  edges: GraphEdge[];
  bounties?: {
    escrow_contract?: string;
    chain_id?: number;
    defaults?: Partial<BountyMeta>;
    competition?: any;
    milestones?: any;
  };
}

export interface BountySpec {
  version: string;
  project: string;
  bounty_meta: BountyMeta;
  nodes: Record<string, BountyNode>;
  edges: GraphEdge[];
  extracted_at: string;
  parent_graph?: string;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extract a bounty subgraph from a full GID graph
 * 
 * Includes:
 * - Selected nodes
 * - Direct dependencies of selected nodes (where dependency status is not 'done')
 * - All edges between included nodes
 * 
 * @param fullGraph - The complete GID graph
 * @param nodeIds - Array of node IDs to include in the bounty
 * @returns Subgraph containing only the selected nodes and their dependencies
 */
export function extractBountySubgraph(
  fullGraph: GIDGraph,
  nodeIds: string[]
): Pick<GIDGraph, 'nodes' | 'edges' | 'version' | 'project'> {
  const includedNodes = new Set<string>(nodeIds);
  const subgraphNodes: Record<string, BountyNode> = {};
  const subgraphEdges: GraphEdge[] = [];

  // Helper to recursively add dependencies
  const addDependencies = (nodeId: string, visited = new Set<string>()) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    // Find all edges where this node is the target (dependencies)
    const incomingEdges = fullGraph.edges.filter(
      edge => edge.to === nodeId && edge.type === 'depends_on'
    );

    for (const edge of incomingEdges) {
      const depNode = fullGraph.nodes[edge.from];
      
      // Only include dependency if it's not already done
      if (depNode && depNode.status !== 'done') {
        includedNodes.add(edge.from);
        addDependencies(edge.from, visited);
      }
    }
  };

  // Add dependencies for all selected nodes
  for (const nodeId of nodeIds) {
    if (!fullGraph.nodes[nodeId]) {
      throw new Error(`Node ${nodeId} not found in graph`);
    }
    addDependencies(nodeId);
  }

  // Copy nodes
  for (const nodeId of Array.from(includedNodes)) {
    subgraphNodes[nodeId] = { ...fullGraph.nodes[nodeId] };
  }

  // Copy edges that connect included nodes
  for (const edge of fullGraph.edges) {
    if (includedNodes.has(edge.from) && includedNodes.has(edge.to)) {
      subgraphEdges.push({ ...edge });
    }
  }

  return {
    version: fullGraph.version,
    project: fullGraph.project,
    nodes: subgraphNodes,
    edges: subgraphEdges,
  };
}

/**
 * Create a bounty spec from a subgraph and bounty metadata
 * 
 * @param subgraph - Extracted subgraph
 * @param bountyMeta - Bounty metadata (budget, deadline, etc.)
 * @returns Complete bounty specification
 */
export function createBountySpec(
  subgraph: Pick<GIDGraph, 'nodes' | 'edges' | 'version' | 'project'>,
  bountyMeta: BountyMeta
): BountySpec {
  return {
    version: subgraph.version,
    project: subgraph.project,
    bounty_meta: bountyMeta,
    nodes: subgraph.nodes,
    edges: subgraph.edges,
    extracted_at: new Date().toISOString(),
  };
}

/**
 * Validate a bounty spec
 * 
 * Ensures:
 * - At least one work node exists
 * - All nodes have required three layers (work, info boundary, acceptance harness)
 * - Info boundary is consistent with inputs/outputs
 * - Acceptance harness has at least one check
 * 
 * @param spec - Bounty specification to validate
 * @returns Validation result with errors if any
 */
export function validateBountySpec(spec: BountySpec): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check we have nodes
  const nodeIds = Object.keys(spec.nodes);
  if (nodeIds.length === 0) {
    errors.push('Bounty spec must contain at least one node');
    return { valid: false, errors };
  }

  // Validate each node has three layers
  for (const [nodeId, node] of Object.entries(spec.nodes)) {
    // Layer 1: Work Node - must have type, description, outputs
    if (!node.type) {
      errors.push(`Node ${nodeId}: missing type (Layer 1: Work Node)`);
    }
    if (!node.description) {
      errors.push(`Node ${nodeId}: missing description (Layer 1: Work Node)`);
    }

    // Layer 2: Info Boundary - must have access_scope or info_boundary
    const infoBoundary = node.info_boundary || node.access_scope;
    if (!infoBoundary) {
      errors.push(`Node ${nodeId}: missing info_boundary/access_scope (Layer 2: Info Boundary)`);
    } else {
      // Validate info boundary structure
      if (!infoBoundary.files || !infoBoundary.files.read || !infoBoundary.files.write) {
        errors.push(
          `Node ${nodeId}: info_boundary must have files.read and files.write arrays`
        );
      }

      // Validate inputs are in read scope
      if (node.inputs) {
        const readPathsArray = infoBoundary.files.read || [];
        const readPaths = new Set(readPathsArray);
        
        const checkPaths = (items: Array<{ path: string }> | undefined, name: string) => {
          items?.forEach(item => {
            if (!readPaths.has(item.path)) {
              errors.push(
                `Node ${nodeId}: inputs.${name} path "${item.path}" not in info_boundary.files.read`
              );
            }
          });
        };

        checkPaths(node.inputs.interfaces, 'interfaces');
        checkPaths(node.inputs.mocks, 'mocks');
        checkPaths(node.inputs.test_vectors, 'test_vectors');
      }

      // Validate outputs are in write scope
      if (node.outputs?.artifacts) {
        const writePathsArray = infoBoundary.files.write || [];
        const writePaths = new Set(writePathsArray);
        node.outputs.artifacts.forEach(artifact => {
          if (!writePaths.has(artifact.path)) {
            errors.push(
              `Node ${nodeId}: outputs.artifacts path "${artifact.path}" not in info_boundary.files.write`
            );
          }
        });
      }

      // Validate deny list doesn't overlap with read
      if (infoBoundary.files.deny) {
        const readPathsArray = infoBoundary.files.read || [];
        const readPaths = new Set(readPathsArray);
        infoBoundary.files.deny.forEach(path => {
          if (readPaths.has(path)) {
            errors.push(
              `Node ${nodeId}: info_boundary.files.deny path "${path}" also in files.read`
            );
          }
        });
      }
    }

    // Layer 3: Acceptance Harness - must have verification or harness with checks
    const harness = node.harness || node.verification;
    if (!harness) {
      errors.push(`Node ${nodeId}: missing harness/verification (Layer 3: Acceptance Harness)`);
    } else {
      const checks = harness.checks || harness.criteria;
      if (!checks || checks.length === 0) {
        errors.push(
          `Node ${nodeId}: harness must have at least one check/criteria`
        );
      }

      // Validate timeout
      if (harness.timeout_per_check !== undefined) {
        if (harness.timeout_per_check <= 0 || harness.timeout_per_check > 3600) {
          errors.push(
            `Node ${nodeId}: harness.timeout_per_check must be > 0 and < 3600 seconds`
          );
        }
      }
    }
  }

  // Validate edges reference existing nodes
  for (const edge of spec.edges) {
    if (!spec.nodes[edge.from]) {
      errors.push(`Edge references non-existent node: ${edge.from}`);
    }
    if (!spec.nodes[edge.to]) {
      errors.push(`Edge references non-existent node: ${edge.to}`);
    }
  }

  // Validate bounty metadata
  if (!spec.bounty_meta.budget || spec.bounty_meta.budget <= 0) {
    errors.push('bounty_meta.budget must be > 0');
  }
  if (!spec.bounty_meta.deadline) {
    errors.push('bounty_meta.deadline is required');
  }
  if (!spec.bounty_meta.currency) {
    errors.push('bounty_meta.currency is required');
  }
  if (!spec.bounty_meta.type) {
    errors.push('bounty_meta.type is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Serialize a bounty spec to YAML
 * 
 * @param spec - Bounty specification
 * @returns YAML string
 */
export function serializeBountySpec(spec: BountySpec): string {
  return yaml.dump(spec, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
  });
}

/**
 * Parse a bounty spec from YAML
 * 
 * @param yamlString - YAML string
 * @returns Parsed bounty specification
 */
export function parseBountySpec(yamlString: string): BountySpec {
  const parsed = yaml.load(yamlString) as BountySpec;
  
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid YAML: expected object');
  }

  // Validate basic structure
  if (!parsed.nodes || !parsed.edges) {
    throw new Error('Invalid bounty spec: missing nodes or edges');
  }

  return parsed;
}

/**
 * Apply access scope filtering to a bounty spec
 * 
 * Removes any information from nodes that falls outside their access scope.
 * Used when serving bounty specs to agents to enforce info boundaries.
 * 
 * @param spec - Bounty specification
 * @returns Scoped bounty specification
 */
export function applyScopeFiltering(spec: BountySpec): BountySpec {
  const scopedSpec: BountySpec = {
    ...spec,
    nodes: {},
  };

  for (const [nodeId, node] of Object.entries(spec.nodes)) {
    const infoBoundary = node.info_boundary || node.access_scope;
    
    if (!infoBoundary) {
      // No boundary defined, include as-is (shouldn't happen in validated specs)
      scopedSpec.nodes[nodeId] = { ...node };
      continue;
    }

    // Filter files list to only include readable files
    const allowedFilesArray = [
      ...(infoBoundary.files.read || []),
      ...(infoBoundary.files.write || []),
    ];
    const allowedFiles = new Set(allowedFilesArray);

    const scopedNode: BountyNode = {
      ...node,
      files: node.files?.filter(f => allowedFiles.has(f)),
    };

    scopedSpec.nodes[nodeId] = scopedNode;
  }

  return scopedSpec;
}
