import { db } from "@/lib/db-factory";
import { approveChangeOrder } from "@/lib/spec-loop";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/v1/market/listings/[id]/spec/change-order/[orderId]/approve
 * Approve a change order and create escrow for delta cost
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id: listingId, orderId } = await params;
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

    const changeOrder = await db.getChangeOrder(orderId);
    if (!changeOrder) {
      return NextResponse.json(
        { success: false, error: "Change order not found" },
        { status: 404 }
      );
    }

    if (changeOrder.listing_id !== listingId) {
      return NextResponse.json(
        { success: false, error: "Change order does not belong to this listing" },
        { status: 400 }
      );
    }

    const approvedChangeOrder = await approveChangeOrder(orderId, agent.id);

    return NextResponse.json({
      success: true,
      changeOrder: approvedChangeOrder
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
