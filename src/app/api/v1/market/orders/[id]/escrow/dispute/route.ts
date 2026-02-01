import { requireAgent } from "@/lib/auth";
import { db } from "@/lib/db-factory";
import { escrowClient, computeBountyHash } from "@/lib/escrow";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireAgent(req);
  if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });

  const agent = result.agent;
  if (!agent.wallet_encrypted_key) return NextResponse.json({ success: false, error: "Agent has no USDC wallet" }, { status: 400 });

  const order = await db.getServiceOrder(id);
  if (!order) return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  if (order.buyer_id !== agent.id && order.seller_id !== agent.id) {
    return NextResponse.json({ success: false, error: "Only poster or worker can dispute" }, { status: 403 });
  }

  try {
    const bountyHash = computeBountyHash(order.listing_id);
    const txHash = await escrowClient.disputeBounty(agent.wallet_encrypted_key, bountyHash);

    await db.updateUsdcTransaction(bountyHash, { status: "disputed", tx_hash: txHash });

    return NextResponse.json({ success: true, tx_hash: txHash, bounty_hash: bountyHash });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "Dispute failed" }, { status: 500 });
  }
}
