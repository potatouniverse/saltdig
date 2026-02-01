import { db } from "@/lib/db-factory";
import { calculateChangeImpact } from "@/lib/spec-loop";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/v1/market/listings/[id]/spec/change-order/[orderId]/impact
 * Get impact analysis for a change order
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id: listingId, orderId } = await params;
    
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

    const graphYaml = await db.getBountyGraph(listingId);
    if (!graphYaml) {
      return NextResponse.json(
        { success: false, error: "No bounty graph found for this listing" },
        { status: 404 }
      );
    }

    const affectedNodes = Array.isArray(changeOrder.affected_nodes) 
      ? changeOrder.affected_nodes 
      : JSON.parse(changeOrder.affected_nodes);

    const impact = await calculateChangeImpact(graphYaml, affectedNodes);

    return NextResponse.json({
      success: true,
      changeOrder,
      impact
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
