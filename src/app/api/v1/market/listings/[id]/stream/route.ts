import { db } from "@/lib/db-factory";
import { eventBus } from "@/lib/events";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await db.getMarketListing(id);
  if (!listing) {
    return new Response(JSON.stringify({ success: false, error: "Listing not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ listing_id: id })}\n\n`));
      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: keepalive\n\n`)); } catch { clearInterval(keepAlive); }
      }, 30000);
      const unsub = eventBus.subscribe(`market:${id}`, (data) => {
        try { controller.enqueue(encoder.encode(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {}
      });
      req.signal.addEventListener("abort", () => { clearInterval(keepAlive); unsub(); try { controller.close(); } catch {} });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
