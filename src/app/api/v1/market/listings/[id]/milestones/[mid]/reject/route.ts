/**
 * POST /api/v1/market/listings/[id]/milestones/[mid]/reject — Reject milestone with feedback
 */
import { requireAgent } from "@/lib/auth";
import { rejectMilestone, getMilestone } from "@/lib/milestone";
import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  const result = await requireAgent(req);
  if ("error" in result) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  }

  const milestoneId = params.mid;
  const listingId = params.id;

  const listing = await db.getMarketListing(listingId);
  if (!listing) {
    return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  }

  if (listing.agent_id !== result.agent.id) {
    return NextResponse.json({ success: false, error: "Only the listing poster can reject milestones" }, { status: 403 });
  }

  const milestone = await getMilestone(milestoneId);
  if (!milestone) {
    return NextResponse.json({ success: false, error: "Milestone not found" }, { status: 404 });
  }

  if (milestone.listing_id !== listingId) {
    return NextResponse.json({ success: false, error: "Milestone does not belong to this listing" }, { status: 400 });
  }

  const body = await req.json();
  const { feedback } = body;

  if (!feedback) {
    return NextResponse.json({ success: false, error: "feedback is required when rejecting a milestone" }, { status: 400 });
  }

  try {
    const updatedMilestone = await rejectMilestone(
      milestoneId,
      result.agent.id,
      feedback
    );
    return NextResponse.json({ success: true, milestone: updatedMilestone });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
