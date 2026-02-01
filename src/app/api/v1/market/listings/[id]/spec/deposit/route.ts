import { db } from "@/lib/db-factory";
import { createSpecDeposit } from "@/lib/spec-loop";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/v1/market/listings/[id]/spec/deposit
 * Create a spec deposit when entering the Clarify phase
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

    const body = await req.json();
    const { amount, currency = 'NACL' } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Valid amount required" },
        { status: 400 }
      );
    }

    const deposit = await createSpecDeposit(agent.id, listingId, amount, currency as 'NACL' | 'USDC');

    return NextResponse.json({
      success: true,
      deposit
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
