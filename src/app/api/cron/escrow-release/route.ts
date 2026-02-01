import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db-factory";
import { escrowClient } from "@/lib/escrow";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pending = await db.getSubmittedUsdcTransactions();
    const now = Math.floor(Date.now() / 1000);
    const autoReleaseSeconds = 72 * 3600; // 72 hours
    let released = 0;
    const errors: string[] = [];

    for (const tx of pending) {
      try {
        const bounty = await escrowClient.getBounty(tx.bounty_hash);
        if (bounty.status !== 2) continue; // Not submitted
        if (bounty.submittedAt === 0) continue;
        if (now < bounty.submittedAt + autoReleaseSeconds) continue;

        const txHash = await escrowClient.autoRelease(tx.bounty_hash);
        await db.updateUsdcTransaction(tx.bounty_hash, {
          status: "auto_released",
          tx_hash: txHash,
          completed_at: new Date().toISOString(),
        });
        released++;
      } catch (e: any) {
        errors.push(`${tx.bounty_hash}: ${e.message}`);
      }
    }

    return NextResponse.json({ success: true, released, errors });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
