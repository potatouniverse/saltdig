import { db } from "@/lib/db-factory";
import { createChangeOrder } from "@/lib/spec-loop";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/v1/market/listings/[id]/spec/change-order
 * Request a change after spec freeze
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
    const { affectedNodeIds, description } = body;

    if (!affectedNodeIds || !Array.isArray(affectedNodeIds) || affectedNodeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "affectedNodeIds array required" },
        { status: 400 }
      );
    }

    if (!description || description.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "description required" },
        { status: 400 }
      );
    }

    const changeOrder = await createChangeOrder(
      listingId,
      agent.id,
      affectedNodeIds,
      description
    );

    return NextResponse.json({
      success: true,
      changeOrder
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

/**
 * GET /api/v1/market/listings/[id]/spec/change-order
 * Get all change orders for a listing
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: listingId } = await params;
    
    const changeOrders = await db.getChangeOrders(listingId);

    return NextResponse.json({
      success: true,
      changeOrders
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
