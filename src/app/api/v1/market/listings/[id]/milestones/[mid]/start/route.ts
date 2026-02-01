/**
 * POST /api/v1/market/listings/[id]/milestones/[mid]/start — Agent claims and starts milestone
 */
import { requireAgent } from "@/lib/auth";
import { startMilestone, getMilestone } from "@/lib/milestone";
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

  const milestone = await getMilestone(milestoneId);
  if (!milestone) {
    return NextResponse.json({ success: false, error: "Milestone not found" }, { status: 404 });
  }

  try {
    const updatedMilestone = await startMilestone(milestoneId, result.agent.id);
    return NextResponse.json({ success: true, milestone: updatedMilestone });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
