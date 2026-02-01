import { escrowClient, computeBountyHash } from "@/lib/escrow";
import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const listing = await db.getMarketListing(id);
  if (!listing) return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });

  try {
    const bountyHash = computeBountyHash(id);
    const bounty = await escrowClient.getBounty(bountyHash);

    // Check if escrow exists on-chain
    const exists = bounty && bounty.amount && bounty.amount !== "0";

    return NextResponse.json({
      success: true,
      escrow: {
        exists,
        bounty_hash: bountyHash,
        on_chain: bounty,
        amount: exists ? parseFloat(bounty.amount) : 0, // Already formatted
        claimed: bounty?.status === 3 || bounty?.status === 4, // 3 = Completed, 4 = Released
        status: exists ? bounty?.statusLabel || "active" : "none",
      },
    });
  } catch (e: any) {
    // If getBounty fails, likely no escrow exists
    return NextResponse.json({
      success: true,
      escrow: {
        exists: false,
        status: "none",
      },
    });
  }
}
