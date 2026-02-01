/**
 * Bounty Matcher — Intelligent bounty recommendation engine for agents
 */

import type { MarketListingRecord, AgentRecord } from "./db-interface";

export interface AgentProfile {
  id: string;
  name: string;
  capabilities: string[];
  reputation: number;
  completedBounties: number;
  preferredCategories?: string[];
  hourlyRate?: number;
  maxHoursPerWeek?: number;
}

export interface BountyMatch {
  listing: MarketListingRecord;
  score: number;
  reasons: string[];
  concerns: string[];
  estimatedHours: number;
  hourlyRate: number;
}

export interface MatchFilters {
  minScore?: number;
  maxResults?: number;
  categories?: string[];
  minBudget?: number;
  maxBudget?: number;
}

/**
 * Match an agent to available bounties based on skills, budget, and feasibility
 */
export async function matchAgentToBounties(
  agentProfile: AgentProfile,
  availableBounties: MarketListingRecord[],
  filters: MatchFilters = {}
): Promise<BountyMatch[]> {
  const matches: BountyMatch[] = [];

  for (const bounty of availableBounties) {
    const match = scoreBounty(agentProfile, bounty);

    // Apply filters
    if (filters.minScore && match.score < filters.minScore) continue;
    if (filters.categories && !filters.categories.includes(bounty.category)) continue;

    const price = parseFloat(bounty.price);
    if (filters.minBudget && price < filters.minBudget) continue;
    if (filters.maxBudget && price > filters.maxBudget) continue;

    matches.push(match);
  }

  return rankBounties(matches, filters.maxResults);
}

/**
 * Score a single bounty for an agent
 */
function scoreBounty(agent: AgentProfile, bounty: MarketListingRecord): BountyMatch {
  let score = 0;
  const reasons: string[] = [];
  const concerns: string[] = [];

  // 1. Category match (0-30 points)
  const categoryScore = scoreCategoryMatch(agent, bounty);
  score += categoryScore.score;
  if (categoryScore.reason) reasons.push(categoryScore.reason);

  // 2. Capability match (0-25 points)
  const capabilityScore = scoreCapabilities(agent, bounty);
  score += capabilityScore.score;
  reasons.push(...capabilityScore.reasons);

  // 3. Budget alignment (0-20 points)
  const budgetScore = scoreBudget(agent, bounty);
  score += budgetScore.score;
  if (budgetScore.reason) reasons.push(budgetScore.reason);
  if (budgetScore.concern) concerns.push(budgetScore.concern);

  // 4. Reputation match (0-15 points)
  const repScore = scoreReputation(agent, bounty);
  score += repScore.score;
  if (repScore.reason) reasons.push(repScore.reason);

  // 5. Workload feasibility (0-10 points)
  const workloadScore = scoreWorkload(agent, bounty);
  score += workloadScore.score;
  if (workloadScore.concern) concerns.push(workloadScore.concern);

  // Estimate hours and rate
  const estimatedHours = estimateWorkHours(bounty);
  const price = parseFloat(bounty.price);
  const hourlyRate = price / estimatedHours;

  return {
    listing: bounty,
    score: Math.min(100, Math.round(score)),
    reasons,
    concerns,
    estimatedHours,
    hourlyRate,
  };
}

/**
 * Rank and limit bounty matches
 */
export function rankBounties(matches: BountyMatch[], maxResults?: number): BountyMatch[] {
  const sorted = matches.sort((a, b) => b.score - a.score);
  return maxResults ? sorted.slice(0, maxResults) : sorted;
}

// --- Scoring functions ---

function scoreCategoryMatch(agent: AgentProfile, bounty: MarketListingRecord): {
  score: number;
  reason?: string;
} {
  if (!agent.preferredCategories || agent.preferredCategories.length === 0) {
    return { score: 15 }; // neutral
  }

  if (agent.preferredCategories.includes(bounty.category)) {
    return {
      score: 30,
      reason: `Matches your preferred category: ${bounty.category}`,
    };
  }

  // Partial match for related categories
  const relatedCategories: Record<string, string[]> = {
    code: ["analysis", "research"],
    research: ["analysis", "writing"],
    writing: ["creative", "research"],
    analysis: ["research", "code"],
    creative: ["writing"],
  };

  const related = relatedCategories[bounty.category] || [];
  const hasRelated = related.some((cat) => agent.preferredCategories?.includes(cat));

  if (hasRelated) {
    return {
      score: 15,
      reason: `Related to your skills (${bounty.category})`,
    };
  }

  return { score: 5 };
}

function scoreCapabilities(agent: AgentProfile, bounty: MarketListingRecord): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;

  // Parse capabilities
  const caps = agent.capabilities.map((c) => c.toLowerCase());
  const title = bounty.title.toLowerCase();
  const desc = bounty.description.toLowerCase();

  // Keyword matching
  const keywords = [
    { kw: ["research", "analyze", "analysis"], category: "research", points: 5 },
    { kw: ["write", "writing", "content"], category: "writing", points: 5 },
    { kw: ["code", "coding", "programming", "dev"], category: "code", points: 5 },
    { kw: ["design", "creative", "art"], category: "creative", points: 5 },
  ];

  for (const { kw, category, points } of keywords) {
    const hasCapability = caps.some((cap) => kw.some((k) => cap.includes(k)));
    const inBounty = kw.some((k) => title.includes(k) || desc.includes(k));

    if (hasCapability && inBounty) {
      score += points;
      reasons.push(`Your ${category} skills match this bounty`);
    }
  }

  // Base capability score
  score += Math.min(10, caps.length * 2);

  return { score: Math.min(25, score), reasons };
}

function scoreBudget(agent: AgentProfile, bounty: MarketListingRecord): {
  score: number;
  reason?: string;
  concern?: string;
} {
  const price = parseFloat(bounty.price);
  const estimatedHours = estimateWorkHours(bounty);
  const hourlyRate = price / estimatedHours;

  // Minimum viable bounty
  if (price < 10) {
    return {
      score: 0,
      concern: "Budget too low (<$10)",
    };
  }

  // Compare to agent's hourly rate if available
  if (agent.hourlyRate) {
    const rateRatio = hourlyRate / agent.hourlyRate;

    if (rateRatio >= 1.0) {
      return {
        score: 20,
        reason: `Pays $${hourlyRate.toFixed(2)}/hr (your rate: $${agent.hourlyRate})`,
      };
    } else if (rateRatio >= 0.7) {
      return {
        score: 15,
        reason: `Competitive rate: $${hourlyRate.toFixed(2)}/hr`,
      };
    } else {
      return {
        score: 5,
        concern: `Low hourly rate: $${hourlyRate.toFixed(2)}/hr`,
      };
    }
  }

  // Default scoring based on absolute price
  if (price >= 100) {
    return { score: 20, reason: "High-value bounty ($100+)" };
  } else if (price >= 50) {
    return { score: 15, reason: "Good budget ($50+)" };
  } else if (price >= 25) {
    return { score: 10, reason: "Reasonable budget ($25+)" };
  } else {
    return { score: 5 };
  }
}

function scoreReputation(agent: AgentProfile, bounty: MarketListingRecord): {
  score: number;
  reason?: string;
} {
  // Higher rep = can tackle more complex/high-value bounties
  const price = parseFloat(bounty.price);

  if (agent.reputation >= 100) {
    return { score: 15, reason: "Your high reputation qualifies you" };
  } else if (agent.reputation >= 50) {
    return { score: 12, reason: "Good reputation match" };
  } else if (price > 100 && agent.reputation < 50) {
    // High-value bounty but low rep
    return { score: 5, reason: "Build more reputation for high-value bounties" };
  } else {
    return { score: 10 };
  }
}

function scoreWorkload(agent: AgentProfile, bounty: MarketListingRecord): {
  score: number;
  concern?: string;
} {
  const estimatedHours = estimateWorkHours(bounty);

  if (!agent.maxHoursPerWeek) {
    return { score: 10 }; // neutral
  }

  // Check if delivery time is feasible
  if (bounty.delivery_time) {
    const deadlineHours = parseDeliveryTime(bounty.delivery_time);
    const weeksAvailable = deadlineHours / (7 * 24);
    const weeklyHoursNeeded = estimatedHours / weeksAvailable;

    if (weeklyHoursNeeded > agent.maxHoursPerWeek) {
      return {
        score: 0,
        concern: `Requires ${weeklyHoursNeeded.toFixed(1)} hrs/week (your max: ${agent.maxHoursPerWeek})`,
      };
    } else if (weeklyHoursNeeded > agent.maxHoursPerWeek * 0.8) {
      return {
        score: 5,
        concern: "Tight timeline for your availability",
      };
    } else {
      return { score: 10, concern: undefined };
    }
  }

  return { score: 10 };
}

function estimateWorkHours(bounty: MarketListingRecord): number {
  const price = parseFloat(bounty.price);
  const hourlyRate = 50; // Baseline

  const categoryMultiplier: Record<string, number> = {
    code: 1.2,
    research: 1.0,
    writing: 0.8,
    analysis: 1.1,
    creative: 1.5,
    other: 1.0,
    general: 1.0,
  };

  const multiplier = categoryMultiplier[bounty.category] || 1.0;
  return Math.max(1, Math.ceil((price / hourlyRate) * multiplier));
}

function parseDeliveryTime(deliveryTime: string): number {
  const match = deliveryTime.match(/(\d+)\s*(hour|day|week)/i);
  if (!match) return 24; // default 1 day

  const num = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "hour") return num;
  if (unit === "day") return num * 24;
  if (unit === "week") return num * 24 * 7;
  return 24;
}

/**
 * Build agent profile from AgentRecord
 */
export function buildAgentProfile(agent: AgentRecord, options: {
  preferredCategories?: string[];
  hourlyRate?: number;
  maxHoursPerWeek?: number;
} = {}): AgentProfile {
  const capabilities = agent.capabilities
    ? JSON.parse(agent.capabilities)
    : [];

  return {
    id: agent.id,
    name: agent.name,
    capabilities,
    reputation: agent.reputation || 0,
    completedBounties: agent.nacl_balance > 0 ? Math.floor(agent.nacl_balance / 100) : 0,
    preferredCategories: options.preferredCategories,
    hourlyRate: options.hourlyRate,
    maxHoursPerWeek: options.maxHoursPerWeek,
  };
}
