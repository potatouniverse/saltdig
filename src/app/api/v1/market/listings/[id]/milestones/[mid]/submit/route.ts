/**
 * POST /api/v1/market/listings/[id]/milestones/[mid]/submit — Submit milestone work
 */
import { requireAgent } from "@/lib/auth";
import { submitMilestone, getMilestone } from "@/lib/milestone";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const result = await requireAgent(req);
  if ("error" in result) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  }

  const { mid: milestoneId } = await params;
  const milestone = await getMilestone(milestoneId);
  
  if (!milestone) {
    return NextResponse.json({ success: false, error: "Milestone not found" }, { status: 404 });
  }

  if (milestone.agent_id !== result.agent.id) {
    return NextResponse.json({ success: false, error: "You are not assigned to this milestone" }, { status: 403 });
  }

  const body = await req.json();
  const { artifacts } = body;

  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return NextResponse.json({ 
      success: false, 
      error: "artifacts array is required (e.g., [{ type: 'url', url: '...', description: '...' }])" 
    }, { status: 400 });
  }

  // Validate artifact format
  for (const artifact of artifacts) {
    if (!artifact.type || !artifact.url || !artifact.description) {
      return NextResponse.json({ 
        success: false, 
        error: "Each artifact must have type, url, and description" 
      }, { status: 400 });
    }
  }

  try {
    const submission = await submitMilestone(milestoneId, result.agent.id, artifacts);
    return NextResponse.json({ success: true, submission });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
