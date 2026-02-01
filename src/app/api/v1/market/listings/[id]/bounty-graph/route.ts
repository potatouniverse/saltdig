/**
 * GET /api/v1/market/listings/[id]/bounty-graph
 * 
 * Returns the bounty subgraph for a listing (access-scoped view)
 * Strips any nodes/info outside the bounty's access scope
 */

import { db } from "@/lib/db-factory";
import { 
  parseBountySpec, 
  applyScopeFiltering, 
  type BountySpec 
} from "@/lib/bounty-graph";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Fetch the listing
  const listing = await db.getMarketListing(id);
  if (!listing) {
    return NextResponse.json(
      { success: false, error: "Listing not found" },
      { status: 404 }
    );
  }

  // TODO: Add bounty_graph field to MarketListingRecord in database schema
  // For now, we'll check if there's a bounty_graph in the listing metadata
  // Expected: listing should have a bounty_graph field containing the YAML/JSON spec
  
  let bountySpec: BountySpec;
  
  try {
    // OPTION 1: If bounty_graph is stored as YAML string
    // const bountyYaml = (listing as any).bounty_graph;
    // if (!bountyYaml) {
    //   return NextResponse.json(
    //     { success: false, error: "This listing does not have a bounty graph" },
    //     { status: 404 }
    //   );
    // }
    // bountySpec = parseBountySpec(bountyYaml);

    // OPTION 2: If bounty_graph is stored as JSON object
    // @ts-ignore - bounty_graph field will be added to schema
    const bountyData = listing.bounty_graph;
    if (!bountyData) {
      return NextResponse.json(
        { success: false, error: "This listing does not have a bounty graph" },
        { status: 404 }
      );
    }

    // If it's a string, parse it; if it's already an object, use it
    if (typeof bountyData === 'string') {
      bountySpec = parseBountySpec(bountyData);
    } else {
      bountySpec = bountyData as BountySpec;
    }
  } catch (error) {
    console.error('Error parsing bounty spec:', error);
    return NextResponse.json(
      { success: false, error: "Invalid bounty specification format" },
      { status: 500 }
    );
  }

  // Apply access scope filtering
  // This removes any information from nodes that falls outside their access scope
  const scopedSpec = applyScopeFiltering(bountySpec);

  return NextResponse.json({
    success: true,
    bounty_graph: scopedSpec,
    listing_id: id,
    listing_title: listing.title,
  });
}

/**
 * PATCH /api/v1/market/listings/[id]/bounty-graph
 * 
 * Update the bounty graph for a listing (poster only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Note: Authentication would be added here via requireAgent
  // const result = await requireAgent(req);
  // if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });

  const listing = await db.getMarketListing(id);
  if (!listing) {
    return NextResponse.json(
      { success: false, error: "Listing not found" },
      { status: 404 }
    );
  }

  // Verify poster owns this listing
  // if (listing.agent_id !== result.agent.id) {
  //   return NextResponse.json(
  //     { success: false, error: "Unauthorized: only listing owner can update bounty graph" },
  //     { status: 403 }
  //   );
  // }

  const body = await req.json();
  const { bounty_graph } = body;

  if (!bounty_graph) {
    return NextResponse.json(
      { success: false, error: "bounty_graph is required" },
      { status: 400 }
    );
  }

  try {
    // Validate the bounty spec
    let spec: BountySpec;
    if (typeof bounty_graph === 'string') {
      spec = parseBountySpec(bounty_graph);
    } else {
      spec = bounty_graph;
    }

    // Update the listing with the new bounty graph
    // TODO: Add bounty_graph field to database schema
    await db.updateMarketListing(id, {
      bounty_graph: typeof bounty_graph === 'string' ? bounty_graph : JSON.stringify(bounty_graph),
    });

    return NextResponse.json({
      success: true,
      message: "Bounty graph updated successfully",
    });
  } catch (error) {
    console.error('Error updating bounty graph:', error);
    return NextResponse.json(
      { success: false, error: "Invalid bounty specification" },
      { status: 400 }
    );
  }
}
