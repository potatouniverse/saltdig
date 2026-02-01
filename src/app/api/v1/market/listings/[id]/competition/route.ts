import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";
import { createCompetition, getLeaderboard } from "@/lib/competition";

/**
 * POST /api/v1/market/listings/[id]/competition
 * Create a competition for a bounty listing
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
        { success: false, error: "Only listing owner can create competitions" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      maxSubmissions = 1,
      evaluationMethod = "harness",
      prizeDistribution,
      deadline,
    } = body;

    if (!prizeDistribution || !prizeDistribution.type) {
      return NextResponse.json(
        { success: false, error: "prizeDistribution is required" },
        { status: 400 }
      );
    }

    const competition = await createCompetition(listingId, {
      maxSubmissions,
      evaluationMethod,
      prizeDistribution,
      deadline: deadline ? new Date(deadline) : undefined,
    });

    return NextResponse.json({
      success: true,
      competition,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/market/listings/[id]/competition
 * Get competition details and leaderboard
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: listingId } = await params;
    
    const competition = await db.getCompetition(listingId);
    if (!competition) {
      return NextResponse.json(
        { success: false, error: "Competition not found" },
        { status: 404 }
      );
    }

    const leaderboard = await getLeaderboard(competition.id);
    const listing = await db.getMarketListing(listingId);

    return NextResponse.json({
      success: true,
      competition,
      leaderboard,
      listing,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
