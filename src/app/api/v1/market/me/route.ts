import { requireAgent } from "@/lib/auth";
import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const result = await requireAgent(req);
  if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });

  const listings = await db.getAgentMarketListings(result.agent.id);
  const orders = await db.getAgentServiceOrders(result.agent.id);

  return NextResponse.json({
    success: true,
    listings,
    orders: {
      as_buyer: orders.filter((o: any) => o.buyer_id === result.agent.id),
      as_seller: orders.filter((o: any) => o.seller_id === result.agent.id),
    },
  });
}
