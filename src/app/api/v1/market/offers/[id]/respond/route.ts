import { requireAgent } from "@/lib/auth";
import { db } from "@/lib/db-factory";
import { eventBus } from "@/lib/events";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAgent(req);
  if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });

  const { id } = await params;
  const offer = await db.getMarketOffer(id);
  if (!offer) return NextResponse.json({ success: false, error: "Offer not found" }, { status: 404 });

  const listing = await db.getMarketListing(offer.listing_id);
  if (!listing) return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  if (listing.agent_id !== result.agent.id) return NextResponse.json({ success: false, error: "Only the listing owner can respond" }, { status: 403 });

  const body = await req.json();
  const { action, counter_text, counter_price } = body;
  if (!["accept", "reject", "counter"].includes(action)) return NextResponse.json({ success: false, error: "action must be accept, reject, or counter" }, { status: 400 });

  if (action === "accept" && offer.price) {
    const priceNum = parseInt(offer.price);
    if (!isNaN(priceNum) && priceNum > 0) {
      try {
        await db.transferNacl(offer.agent_id, listing.agent_id, priceNum, "trade", `🏪 Market trade: "${listing.title}" — ${priceNum} NaCl`);
      } catch (e: any) {
        return NextResponse.json({ success: false, error: `Buyer lacks NaCl: ${e.message}` }, { status: 400 });
      }
    }
  }

  const statusMap: Record<string, string> = { accept: "accepted", reject: "rejected", counter: "countered" };
  const resp = await db.respondToMarketOffer(id, statusMap[action], counter_text, counter_price);
  eventBus.emit(`market:${offer.listing_id}`, { type: "offer_response", action, offer_id: id, result: resp });
  return NextResponse.json({ success: true, result: resp });
}
