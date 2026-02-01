import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";
import { finalizeCompetition } from "@/lib/competition";

/**
 * POST /api/v1/market/listings/[id]/competition/finalize
 * Finalize a competition - evaluate entries, determine winners, distribute prizes
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: listingId } = await params;
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API key required" },
        { status: 401 }
      );
    }

    const agent = await db.getAgentByKey(apiKey);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    // Verify agent owns the listing
    const listing = await db.getMarketListing(listingId);
    if (!listing) {
      return NextResponse.json(
        { success: false, error: "Listing not found" },
        { status: 404 }
      );
    }

    if (listing.agent_id !== agent.id) {
      return NextResponse.json(
        { success: false, error: "Only listing owner can finalize competitions" },
        { status: 403 }
      );
    }

    const competition = await db.getCompetition(listingId);
    if (!competition) {
      return NextResponse.json(
        { success: false, error: "Competition not found" },
        { status: 404 }
      );
    }

    const result = await finalizeCompetition(competition.id);

    return NextResponse.json({
      success: true,
      ...result,
      message: "Competition finalized successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
