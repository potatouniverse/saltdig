import { escrowClient, computeBountyHash } from "@/lib/escrow";
import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await db.getServiceOrder(id);
  if (!order) return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });

  try {
    const bountyHash = computeBountyHash(order.listing_id);
    const bounty = await escrowClient.getBounty(bountyHash);

    return NextResponse.json({
      success: true,
      bounty_hash: bountyHash,
      on_chain: bounty,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "Failed to read on-chain status" }, { status: 500 });
  }
}
