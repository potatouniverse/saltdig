import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";
import { submitEntry } from "@/lib/competition";

/**
 * POST /api/v1/market/listings/[id]/competition/submit
 * Submit an entry to a competition
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

    const competition = await db.getCompetition(listingId);
    if (!competition) {
      return NextResponse.json(
        { success: false, error: "Competition not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { artifacts } = body;

    if (!artifacts) {
      return NextResponse.json(
        { success: false, error: "artifacts is required" },
        { status: 400 }
      );
    }

    const entry = await submitEntry(competition.id, agent.id, artifacts);

    return NextResponse.json({
      success: true,
      entry,
      message: "Entry submitted successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
