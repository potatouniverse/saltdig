/**
 * Tool Market Library
 * Marketplace for agents to discover and install capabilities/tools
 */

import { db } from "./db-factory";

// TypeScript Interfaces
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  schema_json: any;
  author_id: string;
  author_name?: string;
  version: string;
  tags: string[];
  is_active: boolean;
  install_count: number;
  average_rating: number;
  created_at: string;
  updated_at: string;
}

export interface ToolInstallation {
  agent_id: string;
  tool_id: string;
  installed_at: string;
  is_enabled: boolean;
  config_json: any;
}

export interface ToolReview {
  id: string;
  agent_id: string;
  tool_id: string;
  agent_name?: string;
  rating: number;
  review: string;
  created_at: string;
  updated_at: string;
}

export interface ToolSearchParams {
  query?: string;
  category?: string;
  tags?: string[];
  minRating?: number;
  limit?: number;
  offset?: number;
}

/**
 * Register a new tool to the marketplace
 */
export async function registerTool(
  agentId: string,
  toolDef: {
    name: string;
    description: string;
    category: string;
    schema_json: any;
    version?: string;
    tags?: string[];
  }
): Promise<ToolDefinition> {
  // Validate agent exists
  const agent = await db.getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  // Create the tool
  return await db.createAgentTool({
    name: toolDef.name,
    description: toolDef.description,
    category: toolDef.category,
    schema_json: toolDef.schema_json,
    author_id: agentId,
    version: toolDef.version || "1.0.0",
    tags: toolDef.tags || [],
  });
}

/**
 * Search for tools in the marketplace
 */
export async function searchTools(params: ToolSearchParams = {}): Promise<ToolDefinition[]> {
  const {
    query,
    category,
    tags,
    minRating,
    limit = 50,
    offset = 0,
  } = params;

  return await db.searchAgentTools({
    query,
    category,
    tags,
    minRating,
    limit,
    offset,
  });
}

/**
 * Install a tool for an agent
 */
export async function installTool(
  agentId: string,
  toolId: string,
  config?: any
): Promise<ToolInstallation> {
  // Validate agent exists
  const agent = await db.getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  // Validate tool exists and is active
  const tool = await db.getAgentTool(toolId);
  if (!tool) {
    throw new Error("Tool not found");
  }
  if (!tool.is_active) {
    throw new Error("Tool is not active");
  }

  // Check if already installed
  const existing = await db.getAgentToolInstallation(agentId, toolId);
  if (existing) {
    throw new Error("Tool already installed");
  }

  // Install the tool
  return await db.installAgentTool({
    agent_id: agentId,
    tool_id: toolId,
    config_json: config || {},
  });
}

/**
 * Uninstall a tool from an agent
 */
export async function uninstallTool(
  agentId: string,
  toolId: string
): Promise<void> {
  const installation = await db.getAgentToolInstallation(agentId, toolId);
  if (!installation) {
    throw new Error("Tool not installed");
  }

  await db.uninstallAgentTool(agentId, toolId);
}

/**
 * Get all installed tools for an agent
 */
export async function getInstalledTools(agentId: string): Promise<ToolDefinition[]> {
  const agent = await db.getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  return await db.getAgentInstalledTools(agentId);
}

/**
 * Rate and review a tool
 */
export async function rateAndReview(
  agentId: string,
  toolId: string,
  rating: number,
  review?: string
): Promise<ToolReview> {
  // Validate rating
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  // Validate agent exists
  const agent = await db.getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  // Validate tool exists
  const tool = await db.getAgentTool(toolId);
  if (!tool) {
    throw new Error("Tool not found");
  }

  // Check if agent has the tool installed (optional requirement)
  const installation = await db.getAgentToolInstallation(agentId, toolId);
  if (!installation) {
    throw new Error("You must install the tool before reviewing it");
  }

  // Create or update review
  return await db.createOrUpdateAgentToolReview({
    agent_id: agentId,
    tool_id: toolId,
    rating,
    review: review || "",
  });
}

/**
 * Get reviews for a tool
 */
export async function getToolReviews(
  toolId: string,
  limit: number = 50
): Promise<ToolReview[]> {
  return await db.getAgentToolReviews(toolId, limit);
}

/**
 * Get a single tool by ID with full details
 */
export async function getToolById(toolId: string): Promise<ToolDefinition | null> {
  return await db.getAgentTool(toolId);
}

/**
 * Update a tool (only by author)
 */
export async function updateTool(
  agentId: string,
  toolId: string,
  updates: Partial<ToolDefinition>
): Promise<void> {
  const tool = await db.getAgentTool(toolId);
  if (!tool) {
    throw new Error("Tool not found");
  }

  if (tool.author_id !== agentId) {
    throw new Error("Only the author can update this tool");
  }

  await db.updateAgentTool(toolId, updates);
}

/**
 * Get tools by author
 */
export async function getToolsByAuthor(
  authorId: string,
  limit: number = 50
): Promise<ToolDefinition[]> {
  return await db.getAgentToolsByAuthor(authorId, limit);
}
