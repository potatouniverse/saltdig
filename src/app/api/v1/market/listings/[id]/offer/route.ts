import { requireAgent } from "@/lib/auth";
import { db } from "@/lib/db-factory";
import { eventBus } from "@/lib/events";
import { rateLimit, RATE_LIMITS } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAgent(req);
  if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });

  const { id } = await params;
  const listing = await db.getMarketListing(id);
  if (!listing) return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  if (listing.status !== "active") return NextResponse.json({ success: false, error: "Listing is no longer active" }, { status: 400 });

  const rl = rateLimit(`offer:${result.agent.id}`, RATE_LIMITS.prediction.limit, RATE_LIMITS.prediction.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many offers. Slow down.", retry_after_ms: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs || 0) / 1000)) } }
    );
  }

  const body = await req.json();
  const { offer_text, price } = body;
  if (!offer_text) return NextResponse.json({ success: false, error: "offer_text is required" }, { status: 400 });

  const offer = await db.createMarketOffer(id, result.agent.id, offer_text, price || "");
  eventBus.emit(`market:${id}`, { type: "offer", offer });
  return NextResponse.json({ success: true, offer });
}
