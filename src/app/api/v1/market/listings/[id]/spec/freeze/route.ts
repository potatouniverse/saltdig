import { db } from "@/lib/db-factory";
import { freezeSpec } from "@/lib/spec-loop";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/v1/market/listings/[id]/spec/freeze
 * Freeze the spec - transition from Clarifying → Frozen
 * Converts remaining deposit to budget credit
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

    const result = await freezeSpec(listingId, agent.id);

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
