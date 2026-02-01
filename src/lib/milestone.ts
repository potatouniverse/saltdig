/**
 * Milestone Management — Upwork-style partial escrow releases
 */
import { db } from "./db-factory";
import { randomBytes } from "crypto";

export interface Milestone {
  id: string;
  listing_id: string;
  title: string;
  description: string;
  budget_percentage: number;
  acceptance_criteria: string;
  order_index: number;
  status: "pending" | "in_progress" | "submitted" | "approved" | "rejected";
  agent_id: string | null;
  created_at: string;
  started_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
}

export interface MilestoneSubmission {
  id: string;
  milestone_id: string;
  agent_id: string;
  artifacts_json: string; // JSON array of { type, url, description }
  feedback: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
}

export interface MilestoneProgress {
  listing_id: string;
  total_milestones: number;
  completed_milestones: number;
  budget_released_percentage: number;
  current_milestone: Milestone | null;
  all_milestones: Milestone[];
}

export interface CreateMilestoneInput {
  title: string;
  description: string;
  budget_percentage: number;
  acceptance_criteria: string;
}

/**
 * Create a milestone plan for a listing
 * Validates that budget percentages sum to 100%
 */
export async function createMilestones(
  listingId: string,
  milestones: CreateMilestoneInput[]
): Promise<Milestone[]> {
  // Validate total budget = 100%
  const totalBudget = milestones.reduce((sum, m) => sum + m.budget_percentage, 0);
  if (Math.abs(totalBudget - 100) > 0.01) {
    throw new Error(`Budget percentages must sum to 100%, got ${totalBudget}%`);
  }

  // Validate individual percentages
  for (const m of milestones) {
    if (m.budget_percentage <= 0 || m.budget_percentage > 100) {
      throw new Error(`Budget percentage must be between 0 and 100, got ${m.budget_percentage}%`);
    }
  }

  const created: Milestone[] = [];
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i];
    const milestone = await db.createMilestone({
      listing_id: listingId,
      title: m.title,
      description: m.description,
      budget_percentage: m.budget_percentage,
      acceptance_criteria: m.acceptance_criteria,
      order_index: i,
    });
    created.push(milestone);
  }

  return created;
}

/**
 * Start working on a milestone (agent claims it)
 */
export async function startMilestone(
  milestoneId: string,
  agentId: string
): Promise<Milestone> {
  const milestone = await db.getMilestone(milestoneId);
  if (!milestone) {
    throw new Error("Milestone not found");
  }

  if (milestone.status !== "pending") {
    throw new Error(`Milestone is ${milestone.status}, cannot start`);
  }

  // Check if previous milestones are complete
  const allMilestones = await db.getMilestones(milestone.listing_id);
  const sortedMilestones = allMilestones.sort((a, b) => a.order_index - b.order_index);
  
  for (const m of sortedMilestones) {
    if (m.order_index < milestone.order_index && m.status !== "approved") {
      throw new Error(`Previous milestone "${m.title}" must be completed first`);
    }
    if (m.id === milestoneId) break;
  }

  await db.updateMilestone(milestoneId, {
    status: "in_progress",
    agent_id: agentId,
    started_at: new Date().toISOString(),
  });

  return await db.getMilestone(milestoneId) as Milestone;
}

/**
 * Submit milestone deliverables
 */
export async function submitMilestone(
  milestoneId: string,
  agentId: string,
  artifacts: Array<{ type: string; url: string; description: string }>
): Promise<MilestoneSubmission> {
  const milestone = await db.getMilestone(milestoneId);
  if (!milestone) {
    throw new Error("Milestone not found");
  }

  if (milestone.status !== "in_progress") {
    throw new Error(`Milestone is ${milestone.status}, cannot submit`);
  }

  if (milestone.agent_id !== agentId) {
    throw new Error("You are not assigned to this milestone");
  }

  // Create submission record
  const submission = await db.createMilestoneSubmission({
    milestone_id: milestoneId,
    agent_id: agentId,
    artifacts_json: JSON.stringify(artifacts),
    status: "pending",
  });

  // Update milestone status
  await db.updateMilestone(milestoneId, {
    status: "submitted",
    submitted_at: new Date().toISOString(),
  });

  return submission;
}

/**
 * Approve milestone and trigger partial escrow release
 */
export async function approveMilestone(
  milestoneId: string,
  posterId: string
): Promise<{ milestone: Milestone; released_amount: number }> {
  const milestone = await db.getMilestone(milestoneId);
  if (!milestone) {
    throw new Error("Milestone not found");
  }

  if (milestone.status !== "submitted") {
    throw new Error(`Milestone is ${milestone.status}, cannot approve`);
  }

  // Verify poster owns the listing
  const listing = await db.getMarketListing(milestone.listing_id);
  if (!listing) {
    throw new Error("Listing not found");
  }

  if (listing.agent_id !== posterId) {
    throw new Error("Only the listing poster can approve milestones");
  }

  // Calculate release amount
  const budgetStr = listing.price || "0";
  const totalBudget = parseFloat(budgetStr);
  const releaseAmount = totalBudget * (milestone.budget_percentage / 100);

  // Update milestone status
  await db.updateMilestone(milestoneId, {
    status: "approved",
    approved_at: new Date().toISOString(),
  });

  // Update submission status
  const submissions = await db.getMilestoneSubmissions(milestoneId);
  if (submissions.length > 0) {
    await db.updateMilestoneSubmission(submissions[0].id, {
      status: "approved",
      reviewed_at: new Date().toISOString(),
    });
  }

  // Transfer funds to worker
  if (milestone.agent_id && listing.currency === "salt") {
    await db.transferNacl(
      null, // From escrow (system)
      milestone.agent_id,
      releaseAmount,
      "milestone_payment",
      `Milestone payment: ${milestone.title} (${milestone.budget_percentage}%)`
    );
  }

  // TODO: Handle USDC milestone releases via smart contract
  // For now, we track in the database and handle manually

  return {
    milestone: await db.getMilestone(milestoneId) as Milestone,
    released_amount: releaseAmount,
  };
}

/**
 * Reject milestone with feedback
 */
export async function rejectMilestone(
  milestoneId: string,
  posterId: string,
  feedback: string
): Promise<Milestone> {
  const milestone = await db.getMilestone(milestoneId);
  if (!milestone) {
    throw new Error("Milestone not found");
  }

  if (milestone.status !== "submitted") {
    throw new Error(`Milestone is ${milestone.status}, cannot reject`);
  }

  // Verify poster owns the listing
  const listing = await db.getMarketListing(milestone.listing_id);
  if (!listing) {
    throw new Error("Listing not found");
  }

  if (listing.agent_id !== posterId) {
    throw new Error("Only the listing poster can reject milestones");
  }

  // Update milestone status back to in_progress
  await db.updateMilestone(milestoneId, {
    status: "in_progress",
  });

  // Update submission with feedback
  const submissions = await db.getMilestoneSubmissions(milestoneId);
  if (submissions.length > 0) {
    await db.updateMilestoneSubmission(submissions[0].id, {
      status: "rejected",
      feedback,
      reviewed_at: new Date().toISOString(),
    });
  }

  return await db.getMilestone(milestoneId) as Milestone;
}

/**
 * Get overall milestone progress for a listing
 */
export async function getMilestoneProgress(
  listingId: string
): Promise<MilestoneProgress> {
  const milestones = await db.getMilestones(listingId);
  const sorted = milestones.sort((a, b) => a.order_index - b.order_index);

  const completed = sorted.filter(m => m.status === "approved");
  const budgetReleased = completed.reduce((sum, m) => sum + m.budget_percentage, 0);
  
  const current = sorted.find(m => 
    m.status === "in_progress" || m.status === "submitted"
  ) || sorted.find(m => m.status === "pending") || null;

  return {
    listing_id: listingId,
    total_milestones: sorted.length,
    completed_milestones: completed.length,
    budget_released_percentage: budgetReleased,
    current_milestone: current,
    all_milestones: sorted,
  };
}

/**
 * Get all milestones for a listing
 */
export async function getMilestones(listingId: string): Promise<Milestone[]> {
  const milestones = await db.getMilestones(listingId);
  return milestones.sort((a, b) => a.order_index - b.order_index);
}

/**
 * Get a single milestone
 */
export async function getMilestone(milestoneId: string): Promise<Milestone | null> {
  return await db.getMilestone(milestoneId);
}

/**
 * Get submissions for a milestone
 */
export async function getMilestoneSubmissions(
  milestoneId: string
): Promise<MilestoneSubmission[]> {
  return await db.getMilestoneSubmissions(milestoneId);
}
