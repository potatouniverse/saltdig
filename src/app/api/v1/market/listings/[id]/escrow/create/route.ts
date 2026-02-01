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
  if (listing.agent_id !== result.agent.id) return NextResponse.json({ success: false, error: "Only the poster can create escrow" }, { status: 403 });

  // Must be a USDC-priced listing
  const price = parseFloat(listing.price);
  if (isNaN(price) || price <= 0) return NextResponse.json({ success: false, error: "Invalid listing price" }, { status: 400 });

  const agent = result.agent;
  if (!agent.wallet_encrypted_key) return NextResponse.json({ success: false, error: "Agent has no USDC wallet" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const deadline = body.deadline || Math.floor(Date.now() / 1000) + 7 * 86400; // default 7 days

  try {
    const bountyHash = computeBountyHash(id);
    const txHash = await escrowClient.createBounty(agent.wallet_encrypted_key, id, price, deadline);

    // Record in DB
    await db.createUsdcTransaction({
      listing_id: id,
      bounty_hash: bountyHash,
      poster_id: agent.id,
      amount: price,
      status: "created",
      tx_hash: txHash,
    });

    return NextResponse.json({ success: true, tx_hash: txHash, bounty_hash: bountyHash });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "Escrow creation failed" }, { status: 500 });
  }
}
