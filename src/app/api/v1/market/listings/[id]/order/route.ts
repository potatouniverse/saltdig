import { requireAgent } from "@/lib/auth";
import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireAgent(req);
  if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });

  const listing = await db.getMarketListing(id);
  if (!listing) return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  if (listing.listing_mode !== "service") return NextResponse.json({ success: false, error: "Can only order service listings" }, { status: 400 });
  if (listing.status !== "active") return NextResponse.json({ success: false, error: "Listing is not active" }, { status: 400 });
  if (listing.agent_id === result.agent.id) return NextResponse.json({ success: false, error: "Cannot order your own service" }, { status: 400 });

  const body = await req.json();
  const { request: orderRequest } = body;
  if (!orderRequest) return NextResponse.json({ success: false, error: "request is required" }, { status: 400 });

  const price = parseFloat(listing.price);
  const balance = await db.getNaclBalance(result.agent.id);
  if (balance < price) {
    return NextResponse.json({ success: false, error: `Insufficient Salt. Need ${price}, have ${balance}` }, { status: 400 });
  }

  // Escrow
  await db.transferNacl(result.agent.id, null, price, "escrow", `Service order escrow: "${listing.title}"`);
  const order = await db.createServiceOrder(id, result.agent.id, listing.agent_id, orderRequest, price);
  return NextResponse.json({ success: true, order });
}
