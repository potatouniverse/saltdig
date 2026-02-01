/**
 * Core Registry Library
 * IP Core Marketplace — reusable, composable modules that agents can buy/use
 */

import { db } from "./db-factory";

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface CoreManifest {
  id?: string;
  name: string;
  version: string; // semver
  description: string;
  author_id: string;
  author_name?: string;
  category: string; // libraries, services, algorithms, templates
  provides: string[]; // interfaces/capabilities this core provides
  requires: string[]; // dependencies on other cores/contracts
  targets: string[]; // platforms: node18, python3.11, rust-stable, etc
  constraints: {
    min_memory?: string;
    min_cpu?: string;
    license: string;
  };
  harness: {
    run: string; // command to test the core
    expected: string; // expected output/behavior
  };
  config_schema: any; // JSONSchema for parameterization
  pricing: {
    model: 'free' | 'paid' | 'revenue-share';
    price?: number; // in NaCl for paid
    revenue_split?: number; // percentage for revenue-share
  };
  license: string; // MIT, Apache-2.0, commercial, dual
  artifacts: string[]; // files included
  install_count?: number;
  avg_rating?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CoreVersion {
  core_id: string;
  version: string;
  manifest_json: CoreManifest;
  created_at: string;
}

export interface CoreInstallation {
  id: string;
  core_id: string;
  project_id: string;
  agent_id: string;
  config_json: any;
  installed_at: string;
}

export interface CoreMatch {
  core: CoreManifest;
  confidence: number; // 0-1 match score
  provides_matched: string[]; // which capabilities match the need
  missing_deps: string[]; // unresolved dependencies
  reason: string; // why this core matches
}

export interface CoreReview {
  id: string;
  core_id: string;
  agent_id: string;
  agent_name?: string;
  rating: number;
  review: string;
  created_at: string;
  updated_at: string;
}

export interface CoreSearchFilters {
  query?: string;
  category?: string;
  provides?: string[];
  requires?: string[];
  targets?: string[];
  pricing_model?: 'free' | 'paid' | 'revenue-share';
  min_rating?: number;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Core Registry Functions
// ============================================================================

/**
 * Publish a new core to the registry
 */
export async function publishCore(
  agentId: string,
  manifest: Omit<CoreManifest, 'id' | 'author_id' | 'author_name' | 'install_count' | 'avg_rating' | 'created_at' | 'updated_at'>
): Promise<CoreManifest> {
  // Validate agent exists
  const agent = await db.getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  // Validate semver
  const semverRegex = /^\d+\.\d+\.\d+$/;
  if (!semverRegex.test(manifest.version)) {
    throw new Error("Invalid semver version format (expected: X.Y.Z)");
  }

  // Validate pricing
  if (manifest.pricing.model === 'paid' && !manifest.pricing.price) {
    throw new Error("Price is required for paid cores");
  }
  if (manifest.pricing.model === 'revenue-share' && !manifest.pricing.revenue_split) {
    throw new Error("Revenue split is required for revenue-share cores");
  }

  // Create the core
  return await db.createCore({
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author_id: agentId,
    category: manifest.category,
    manifest_json: manifest,
    pricing_model: manifest.pricing.model,
    price: manifest.pricing.price || 0,
    license: manifest.license,
  });
}

/**
 * Search cores by query, filters
 */
export async function searchCores(
  query?: string,
  filters?: CoreSearchFilters
): Promise<CoreManifest[]> {
  return await db.searchCores({
    query,
    category: filters?.category,
    provides: filters?.provides,
    requires: filters?.requires,
    targets: filters?.targets,
    pricing_model: filters?.pricing_model,
    min_rating: filters?.min_rating,
    limit: filters?.limit || 50,
    offset: filters?.offset || 0,
  });
}

/**
 * Get full core details with reviews and stats
 */
export async function getCoreDetail(coreId: string): Promise<{
  core: CoreManifest;
  reviews: CoreReview[];
  stats: {
    install_count: number;
    avg_rating: number;
    review_count: number;
  };
} | null> {
  const core = await db.getCore(coreId);
  if (!core) {
    return null;
  }

  const reviews = await db.getCoreReviews(coreId, 50);
  
  return {
    core,
    reviews,
    stats: {
      install_count: core.install_count || 0,
      avg_rating: core.avg_rating || 0,
      review_count: reviews.length,
    },
  };
}

/**
 * Install a core into a project
 */
export async function installCore(
  projectId: string,
  coreId: string,
  agentId: string,
  config?: any
): Promise<CoreInstallation> {
  // Validate agent exists
  const agent = await db.getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  // Validate core exists
  const core = await db.getCore(coreId);
  if (!core) {
    throw new Error("Core not found");
  }

  // Check if already installed
  const existing = await db.getCoreInstallation(projectId, coreId);
  if (existing) {
    throw new Error("Core already installed in this project");
  }

  // Validate config against schema
  if (config && core.config_schema) {
    // TODO: JSON Schema validation
  }

  // Create installation
  return await db.installCore({
    core_id: coreId,
    project_id: projectId,
    agent_id: agentId,
    config_json: config || {},
  });
}

/**
 * Resolve core dependencies (like npm)
 * Returns flat list of all cores needed, with dependency order
 */
export async function resolveCoreDeps(
  coreIds: string[]
): Promise<{
  resolved: CoreManifest[];
  missing: string[];
  conflicts: { core: string; reason: string }[];
}> {
  const resolved: CoreManifest[] = [];
  const missing: string[] = [];
  const conflicts: { core: string; reason: string }[] = [];
  const visited = new Set<string>();

  async function resolveDep(coreId: string, path: string[] = []): Promise<void> {
    if (visited.has(coreId)) {
      return;
    }

    // Check for circular dependencies
    if (path.includes(coreId)) {
      conflicts.push({
        core: coreId,
        reason: `Circular dependency: ${[...path, coreId].join(' -> ')}`,
      });
      return;
    }

    visited.add(coreId);

    const core = await db.getCore(coreId);
    if (!core) {
      missing.push(coreId);
      return;
    }

    // Recursively resolve dependencies
    for (const dep of core.requires || []) {
      await resolveDep(dep, [...path, coreId]);
    }

    resolved.push(core);
  }

  for (const coreId of coreIds) {
    await resolveDep(coreId);
  }

  return { resolved, missing, conflicts };
}

/**
 * Auto-match cores for a project graph
 * Given a DAG of tasks, find cores that can fill nodes
 */
export async function matchCoresForProject(
  projectGraph: {
    nodes: Array<{
      id: string;
      type: string;
      needs: string[]; // required capabilities
      provides?: string[]; // capabilities this node will provide
    }>;
  }
): Promise<Map<string, CoreMatch[]>> {
  const matches = new Map<string, CoreMatch[]>();

  for (const node of projectGraph.nodes) {
    if (!node.needs || node.needs.length === 0) {
      continue;
    }

    // Search for cores that provide the needed capabilities
    const cores = await db.searchCores({
      provides: node.needs,
      limit: 10,
    });

    const nodeMatches: CoreMatch[] = cores.map((core) => {
      // Calculate confidence score
      const providesMatched = node.needs.filter((need) =>
        core.provides.some((p) => p.toLowerCase().includes(need.toLowerCase()))
      );
      const confidence = providesMatched.length / node.needs.length;

      // Check for missing dependencies
      const missingDeps = core.requires.filter(
        (req) => !projectGraph.nodes.some((n) => n.provides?.includes(req))
      );

      return {
        core,
        confidence,
        provides_matched: providesMatched,
        missing_deps: missingDeps,
        reason: `Provides ${providesMatched.length}/${node.needs.length} required capabilities`,
      };
    });

    // Sort by confidence
    nodeMatches.sort((a, b) => b.confidence - a.confidence);
    matches.set(node.id, nodeMatches);
  }

  return matches;
}

/**
 * Generate adapter tasks for integration gaps
 * Creates TaskSpec nodes for missing dependencies or integration work
 */
export async function generateAdapterTasks(
  projectGraph: {
    nodes: Array<{
      id: string;
      type: string;
      needs: string[];
      provides?: string[];
    }>;
  },
  matchedCores: Map<string, CoreMatch[]>
): Promise<Array<{
  id: string;
  type: 'adapter';
  description: string;
  from: string; // source node/core
  to: string; // target node
  missing_deps: string[];
  effort_estimate: 'low' | 'medium' | 'high';
}>> {
  const adapters: Array<{
    id: string;
    type: 'adapter';
    description: string;
    from: string;
    to: string;
    missing_deps: string[];
    effort_estimate: 'low' | 'medium' | 'high';
  }> = [];

  for (const [nodeId, matches] of matchedCores.entries()) {
    const node = projectGraph.nodes.find((n) => n.id === nodeId);
    if (!node || matches.length === 0) {
      continue;
    }

    const bestMatch = matches[0];
    if (bestMatch.missing_deps.length > 0) {
      // Need adapter tasks for missing dependencies
      const effortEstimate =
        bestMatch.missing_deps.length === 1
          ? 'low'
          : bestMatch.missing_deps.length <= 3
          ? 'medium'
          : 'high';

      adapters.push({
        id: `adapter-${nodeId}-${bestMatch.core.id}`,
        type: 'adapter',
        description: `Integrate ${bestMatch.core.name} with ${nodeId}: resolve dependencies ${bestMatch.missing_deps.join(', ')}`,
        from: bestMatch.core.id || bestMatch.core.name,
        to: nodeId,
        missing_deps: bestMatch.missing_deps,
        effort_estimate: effortEstimate,
      });
    }

    // Check for partial matches that need adaptation
    if (bestMatch.confidence < 1.0 && bestMatch.confidence > 0.5) {
      adapters.push({
        id: `adapter-partial-${nodeId}-${bestMatch.core.id}`,
        type: 'adapter',
        description: `Adapt ${bestMatch.core.name} to fully satisfy ${nodeId} requirements (${Math.round(bestMatch.confidence * 100)}% match)`,
        from: bestMatch.core.id || bestMatch.core.name,
        to: nodeId,
        missing_deps: node.needs.filter((n) => !bestMatch.provides_matched.includes(n)),
        effort_estimate: bestMatch.confidence > 0.8 ? 'low' : 'medium',
      });
    }
  }

  return adapters;
}

/**
 * Rate and review a core
 */
export async function rateAndReviewCore(
  agentId: string,
  coreId: string,
  rating: number,
  review?: string
): Promise<CoreReview> {
  // Validate rating
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  // Validate agent exists
  const agent = await db.getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  // Validate core exists
  const core = await db.getCore(coreId);
  if (!core) {
    throw new Error("Core not found");
  }

  // Create or update review
  return await db.createOrUpdateCoreReview({
    agent_id: agentId,
    core_id: coreId,
    rating,
    review: review || "",
  });
}

/**
 * Get all installed cores for a project
 */
export async function getProjectCores(projectId: string): Promise<CoreManifest[]> {
  return await db.getProjectCores(projectId);
}

/**
 * Uninstall a core from a project
 */
export async function uninstallCore(
  projectId: string,
  coreId: string
): Promise<void> {
  const installation = await db.getCoreInstallation(projectId, coreId);
  if (!installation) {
    throw new Error("Core not installed in this project");
  }

  await db.uninstallCore(projectId, coreId);
}

/**
 * Get cores by author
 */
export async function getCoresByAuthor(
  authorId: string,
  limit: number = 50
): Promise<CoreManifest[]> {
  return await db.getCoresByAuthor(authorId, limit);
}
