/**
 * POST /api/v1/market/listings/bounty-from-graph
 * 
 * Accepts a GID graph + node selection → creates a bounty listing with extracted subgraph
 * Attaches budget, deadline, type from request body
 */

import { requireAgent } from "@/lib/auth";
import { db } from "@/lib/db-factory";
import {
  extractBountySubgraph,
  createBountySpec,
  validateBountySpec,
  serializeBountySpec,
  type GIDGraph,
  type BountyMeta,
  type BountyType,
  type Currency,
} from "@/lib/bounty-graph";
import { NextRequest, NextResponse } from "next/server";

interface BountyFromGraphRequest {
  // The full GID graph
  full_graph: GIDGraph;
  
  // Node IDs to include in the bounty
  node_ids: string[];
  
  // Bounty metadata
  title: string;
  description?: string;
  budget: number;
  currency: Currency;
  deadline: string; // ISO 8601 timestamp
  type: BountyType;
  min_reputation?: number;
  tags?: string[];
  
  // Optional: category for the marketplace listing
  category?: string;
}

export async function POST(req: NextRequest) {
  // Authenticate the agent
  const result = await requireAgent(req);
  if ("error" in result) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    );
  }

  let body: BountyFromGraphRequest;
  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate required fields
  const { full_graph, node_ids, title, budget, currency, deadline, type } = body;

  if (!full_graph || !full_graph.nodes || !full_graph.edges) {
    return NextResponse.json(
      { success: false, error: "full_graph is required with nodes and edges" },
      { status: 400 }
    );
  }

  if (!node_ids || !Array.isArray(node_ids) || node_ids.length === 0) {
    return NextResponse.json(
      { success: false, error: "node_ids must be a non-empty array" },
      { status: 400 }
    );
  }

  if (!title) {
    return NextResponse.json(
      { success: false, error: "title is required" },
      { status: 400 }
    );
  }

  if (!budget || budget <= 0) {
    return NextResponse.json(
      { success: false, error: "budget must be > 0" },
      { status: 400 }
    );
  }

  if (!currency || !['USDC', 'SALT'].includes(currency)) {
    return NextResponse.json(
      { success: false, error: "currency must be 'USDC' or 'SALT'" },
      { status: 400 }
    );
  }

  if (!deadline) {
    return NextResponse.json(
      { success: false, error: "deadline is required (ISO 8601 timestamp)" },
      { status: 400 }
    );
  }

  if (!type || !['standard', 'milestone', 'competition'].includes(type)) {
    return NextResponse.json(
      { success: false, error: "type must be 'standard', 'milestone', or 'competition'" },
      { status: 400 }
    );
  }

  // Validate deadline is in the future
  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) {
    return NextResponse.json(
      { success: false, error: "deadline must be a valid ISO 8601 timestamp" },
      { status: 400 }
    );
  }
  if (deadlineDate <= new Date()) {
    return NextResponse.json(
      { success: false, error: "deadline must be in the future" },
      { status: 400 }
    );
  }

  try {
    // Step 1: Extract the bounty subgraph
    const subgraph = extractBountySubgraph(full_graph, node_ids);

    // Step 2: Create bounty metadata
    const bountyMeta: BountyMeta = {
      budget,
      currency,
      deadline,
      type,
      poster: result.agent.id,
      min_reputation: body.min_reputation || 0,
      tags: body.tags || [],
    };

    // Step 3: Create the bounty spec
    const bountySpec = createBountySpec(subgraph, bountyMeta);

    // Step 4: Validate the bounty spec
    const validation = validateBountySpec(bountySpec);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: "Bounty specification validation failed",
          validation_errors: validation.errors,
        },
        { status: 400 }
      );
    }

    // Step 5: Serialize to YAML (for storage)
    const bountyYaml = serializeBountySpec(bountySpec);

    // Step 6: Create the marketplace listing
    const category = body.category || "bounty";
    const description = body.description || `GID Bounty: ${node_ids.length} node(s)`;
    
    // Create the listing with bounty metadata
    const listing = await db.createMarketListing(
      result.agent.id,
      title,
      description,
      "bounty", // type
      category,
      String(budget), // price
      "service", // listing_mode - bounties are services
      deadline // deliveryTime
    );

    // Step 7: Store the bounty graph with the listing
    // TODO: Add bounty_graph field to database schema
    // For now, we'll attempt to update the listing with the bounty_graph
    try {
      await db.updateMarketListing(listing.id, {
        // @ts-ignore - bounty_graph field will be added to schema
        bounty_graph: bountyYaml,
        // Store additional bounty metadata
        bounty_currency: currency,
        bounty_type: type,
        bounty_deadline: deadline,
        bounty_min_reputation: bountyMeta.min_reputation,
        bounty_node_count: node_ids.length,
      });
    } catch (updateError) {
      console.warn('Could not update listing with bounty_graph (field may not exist in schema):', updateError);
      // Continue anyway - the listing was created
    }

    return NextResponse.json({
      success: true,
      listing,
      bounty_spec: bountySpec,
      validation: {
        passed: true,
        node_count: Object.keys(bountySpec.nodes).length,
        edge_count: bountySpec.edges.length,
      },
      message: `Bounty listing created with ${node_ids.length} node(s)`,
    });
  } catch (error: any) {
    console.error('Error creating bounty from graph:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create bounty listing",
      },
      { status: 500 }
    );
  }
}

/**
 * Helper endpoint to validate a graph extraction without creating a listing
 * Useful for testing/previewing before posting
 */
export async function PUT(req: NextRequest) {
  const result = await requireAgent(req);
  if ("error" in result) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    );
  }

  let body: Partial<BountyFromGraphRequest>;
  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { full_graph, node_ids, budget = 100, currency = 'USDC', deadline, type = 'standard' } = body;

  if (!full_graph || !node_ids) {
    return NextResponse.json(
      { success: false, error: "full_graph and node_ids are required" },
      { status: 400 }
    );
  }

  try {
    // Extract subgraph
    const subgraph = extractBountySubgraph(full_graph, node_ids);

    // Create minimal bounty spec for validation
    const bountyMeta: BountyMeta = {
      budget,
      currency,
      deadline: deadline || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      type,
      poster: result.agent.id,
    };

    const bountySpec = createBountySpec(subgraph, bountyMeta);

    // Validate
    const validation = validateBountySpec(bountySpec);

    return NextResponse.json({
      success: true,
      preview: {
        node_count: Object.keys(bountySpec.nodes).length,
        edge_count: bountySpec.edges.length,
        nodes: Object.keys(bountySpec.nodes),
      },
      validation: {
        passed: validation.valid,
        errors: validation.errors,
      },
      bounty_spec: bountySpec,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to validate bounty extraction",
      },
      { status: 400 }
    );
  }
}
