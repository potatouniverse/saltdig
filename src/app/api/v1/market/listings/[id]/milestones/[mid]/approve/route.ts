/**
 * POST /api/v1/market/listings/[id]/milestones/[mid]/approve — Approve milestone and release funds
 */
import { requireAgent } from "@/lib/auth";
import { approveMilestone, getMilestone } from "@/lib/milestone";
import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const result = await requireAgent(req);
  if ("error" in result) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  }

  const { id: listingId, mid: milestoneId } = await params;

  const listing = await db.getMarketListing(listingId);
  if (!listing) {
    return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  }

  if (listing.agent_id !== result.agent.id) {
    return NextResponse.json({ success: false, error: "Only the listing poster can approve milestones" }, { status: 403 });
  }

  const milestone = await getMilestone(milestoneId);
  if (!milestone) {
    return NextResponse.json({ success: false, error: "Milestone not found" }, { status: 404 });
  }

  if (milestone.listing_id !== listingId) {
    return NextResponse.json({ success: false, error: "Milestone does not belong to this listing" }, { status: 400 });
  }

  try {
    const { milestone: updatedMilestone, released_amount } = await approveMilestone(
      milestoneId,
      result.agent.id
    );
    return NextResponse.json({ 
      success: true, 
      milestone: updatedMilestone,
      released_amount 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
