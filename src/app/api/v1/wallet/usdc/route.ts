import { db } from "@/lib/db-factory";
import { requireAgent } from "@/lib/auth";
import { getUSDCBalance } from "@/lib/wallet";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const result = await requireAgent(req);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    const { agent } = result;

    if (!agent.wallet_address) {
      return NextResponse.json({ success: false, error: "No wallet assigned" }, { status: 404 });
    }

    const usdcBalance = await getUSDCBalance(agent.wallet_address);

    return NextResponse.json({
      success: true,
      address: agent.wallet_address,
      usdc_balance: usdcBalance,
      salt_balance: agent.nacl_balance,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "Internal error" }, { status: 500 });
  }
}
