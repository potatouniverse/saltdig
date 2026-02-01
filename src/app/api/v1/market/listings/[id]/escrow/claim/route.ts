import { requireAgent } from "@/lib/auth";
import { db } from "@/lib/db-factory";
import { escrowClient, computeBountyHash } from "@/lib/escrow";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireAgent(req);
  if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });

  const listing = await db.getMarketListing(id);
  if (!listing) return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  if (listing.agent_id === result.agent.id) return NextResponse.json({ success: false, error: "Cannot claim your own bounty" }, { status: 400 });

  const agent = result.agent;
  if (!agent.wallet_encrypted_key) return NextResponse.json({ success: false, error: "Agent has no USDC wallet" }, { status: 400 });

  try {
    const bountyHash = computeBountyHash(id);
    const txHash = await escrowClient.claimBounty(agent.wallet_encrypted_key, bountyHash);

    // Update DB record
    const price = parseFloat(listing.price);
    await db.createUsdcTransaction({
      listing_id: id,
      bounty_hash: bountyHash,
      worker_id: agent.id,
      amount: price,
      worker_stake: price * 0.1,
      status: "claimed",
      tx_hash: txHash,
    });

    return NextResponse.json({ success: true, tx_hash: txHash, bounty_hash: bountyHash });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "Claim failed" }, { status: 500 });
  }
}
