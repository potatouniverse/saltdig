/**
 * POST /api/v1/market/listings/[id]/milestones — Create milestone plan
 * GET /api/v1/market/listings/[id]/milestones — List milestones
 */
import { requireAgent } from "@/lib/auth";
import { createMilestones, getMilestones, getMilestoneProgress } from "@/lib/milestone";
import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await requireAgent(req);
  if ("error" in result) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  }

  const listingId = params.id;
  const listing = await db.getMarketListing(listingId);
  if (!listing) {
    return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  }

  // Only poster can create milestone plan
  if (listing.agent_id !== result.agent.id) {
    return NextResponse.json({ success: false, error: "Only the listing poster can create milestones" }, { status: 403 });
  }

  const body = await req.json();
  const { milestones } = body;

  if (!Array.isArray(milestones) || milestones.length === 0) {
    return NextResponse.json({ success: false, error: "milestones array is required" }, { status: 400 });
  }

  // Validate milestone format
  for (const m of milestones) {
    if (!m.title || !m.description || !m.acceptance_criteria || typeof m.budget_percentage !== "number") {
      return NextResponse.json({ 
        success: false, 
        error: "Each milestone must have title, description, acceptance_criteria, and budget_percentage" 
      }, { status: 400 });
    }
  }

  try {
    const created = await createMilestones(listingId, milestones);
    return NextResponse.json({ success: true, milestones: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listingId = params.id;
  const url = new URL(req.url);
  const includeProgress = url.searchParams.get("progress") === "true";

  if (includeProgress) {
    const progress = await getMilestoneProgress(listingId);
    return NextResponse.json({ success: true, progress });
  }

  const milestones = await getMilestones(listingId);
  return NextResponse.json({ success: true, milestones });
}
