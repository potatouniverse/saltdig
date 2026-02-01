/**
 * Competition Engine — Kaggle-style competitions for bounties
 * Multiple agents submit solutions, best one(s) win based on evaluation
 */

import { db } from './db-factory';
import type { CompetitionRecord, CompetitionEntryRecord } from './db-interface';

export type EvaluationMethod = 'harness' | 'manual' | 'vote';
export type PrizeDistributionType = 'winner-take-all' | 'top-3' | 'proportional';
export type CompetitionStatus = 'active' | 'evaluating' | 'finalized' | 'cancelled';
export type EntryStatus = 'pending' | 'evaluating' | 'scored' | 'winner' | 'disqualified';

export interface PrizeDistribution {
  type: PrizeDistributionType;
  config?: {
    // For 'top-3': percentages for 1st, 2nd, 3rd place
    firstPlace?: number;  // default 50%
    secondPlace?: number; // default 30%
    thirdPlace?: number;  // default 20%
    // For 'proportional': minimum score threshold
    minScore?: number;
  };
}

export interface CompetitionConfig {
  maxSubmissions?: number; // Max submissions per agent (default: 1)
  evaluationMethod: EvaluationMethod;
  prizeDistribution: PrizeDistribution;
  deadline?: Date;
}

export interface Competition {
  id: string;
  listingId: string;
  maxSubmissions: number;
  evaluationMethod: EvaluationMethod;
  prizeDistribution: string; // JSON string
  prizeConfig: any;
  deadline: string | null;
  status: CompetitionStatus;
  winnerId: string | null;
  finalizedAt: string | null;
  createdAt: string;
}

export interface CompetitionEntry {
  id: string;
  competitionId: string;
  agentId: string;
  artifactsJson: any;
  score: number | null;
  rank: number | null;
  status: EntryStatus;
  evaluationResult: any;
  prizeAmount: number | null;
  submittedAt: string;
  evaluatedAt: string | null;
  // Enriched fields
  agentName?: string;
}

export interface EvaluationResult {
  success: boolean;
  score: number;
  details: any;
  feedback?: string;
}

/**
 * Create a new competition for a listing
 */
export async function createCompetition(
  listingId: string,
  config: CompetitionConfig
): Promise<CompetitionRecord> {
  // Verify listing exists and is a bounty
  const listing = await db.getMarketListing(listingId);
  if (!listing) {
    throw new Error('Listing not found');
  }
  if (listing.type !== 'bounty') {
    throw new Error('Only bounty listings can have competitions');
  }

  // Check if competition already exists
  const existing = await db.getCompetition(listingId);
  if (existing) {
    throw new Error('Competition already exists for this listing');
  }

  const prizeConfig = config.prizeDistribution.config || {};
  
  // Set default prize distribution percentages
  if (config.prizeDistribution.type === 'top-3') {
    prizeConfig.firstPlace = prizeConfig.firstPlace || 50;
    prizeConfig.secondPlace = prizeConfig.secondPlace || 30;
    prizeConfig.thirdPlace = prizeConfig.thirdPlace || 20;
  }

  return await db.createCompetition({
    listing_id: listingId,
    max_submissions: config.maxSubmissions || 1,
    evaluation_method: config.evaluationMethod,
    prize_distribution: config.prizeDistribution.type,
    prize_config: prizeConfig,
    deadline: config.deadline ? config.deadline.toISOString() : null,
  });
}

/**
 * Submit an entry to a competition
 */
export async function submitEntry(
  competitionId: string,
  agentId: string,
  artifacts: any
): Promise<CompetitionEntryRecord> {
  const competition = await db.getCompetitionById(competitionId);
  if (!competition) {
    throw new Error('Competition not found');
  }

  if (competition.status !== 'active') {
    throw new Error(`Competition is ${competition.status}, not accepting submissions`);
  }

  // Check deadline
  if (competition.deadline && new Date(competition.deadline) < new Date()) {
    throw new Error('Competition deadline has passed');
  }

  // Check if agent already has a submission
  const existingEntries = await db.getCompetitionEntriesByAgent(competitionId, agentId);
  if (existingEntries.length >= competition.max_submissions) {
    throw new Error(`Maximum ${competition.max_submissions} submission(s) per agent`);
  }

  return await db.createCompetitionEntry({
    competition_id: competitionId,
    agent_id: agentId,
    artifacts_json: artifacts,
  });
}

/**
 * List all entries for a competition
 */
export async function listEntries(competitionId: string): Promise<CompetitionEntryRecord[]> {
  return await db.getCompetitionEntries(competitionId);
}

/**
 * Evaluate a single entry
 * This runs the acceptance harness or manual evaluation
 */
export async function evaluateEntry(
  entryId: string,
  evaluator?: (artifacts: any) => Promise<EvaluationResult>
): Promise<EvaluationResult> {
  const entry = await db.getCompetitionEntry(entryId);
  if (!entry) {
    throw new Error('Entry not found');
  }

  const competition = await db.getCompetitionById(entry.competition_id);
  if (!competition) {
    throw new Error('Competition not found');
  }

  await db.updateCompetitionEntry(entryId, {
    status: 'evaluating',
  });

  let result: EvaluationResult;

  try {
    if (evaluator) {
      // Use provided evaluator function
      result = await evaluator(entry.artifacts_json);
    } else if (competition.evaluation_method === 'harness') {
      // Run acceptance harness (would integrate with existing harness system)
      result = await runAcceptanceHarness(entry.artifacts_json, competition.listing_id);
    } else if (competition.evaluation_method === 'manual') {
      // Manual evaluation - just mark as scored with null score for now
      result = {
        success: true,
        score: 0,
        details: { message: 'Awaiting manual evaluation' },
      };
    } else {
      throw new Error(`Unsupported evaluation method: ${competition.evaluation_method}`);
    }

    await db.updateCompetitionEntry(entryId, {
      status: 'scored',
      score: result.score,
      evaluationResult: result,
      evaluatedAt: new Date().toISOString(),
    });

    return result;
  } catch (error: any) {
    await db.updateCompetitionEntry(entryId, {
      status: 'disqualified',
      evaluationResult: {
        success: false,
        error: error.message,
      },
      evaluatedAt: new Date().toISOString(),
    });
    throw error;
  }
}

/**
 * Finalize competition - determine winners and distribute prizes
 */
export async function finalizeCompetition(competitionId: string): Promise<{
  winners: CompetitionEntryRecord[];
  totalPrize: number;
  distribution: { [agentId: string]: number };
}> {
  const competition = await db.getCompetitionById(competitionId);
  if (!competition) {
    throw new Error('Competition not found');
  }

  if (competition.status === 'finalized') {
    throw new Error('Competition already finalized');
  }

  const listing = await db.getMarketListing(competition.listing_id);
  if (!listing) {
    throw new Error('Listing not found');
  }

  // Get all scored entries, sorted by score descending
  const entries = await db.getCompetitionEntries(competitionId);
  const scoredEntries = entries
    .filter(e => e.status === 'scored' && e.score !== null)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  if (scoredEntries.length === 0) {
    throw new Error('No valid entries to finalize');
  }

  // Calculate prize distribution
  const totalPrize = listing.currency === 'usdc' 
    ? (listing.usdc_amount || 0) 
    : parseFloat(listing.price);

  const distribution: { [agentId: string]: number } = {};
  const winners: CompetitionEntryRecord[] = [];

  if (competition.prize_distribution === 'winner-take-all') {
    // Winner takes all
    const winner = scoredEntries[0];
    distribution[winner.agent_id] = totalPrize;
    winners.push(winner);
    
    await db.updateCompetitionEntry(winner.id, {
      status: 'winner',
      rank: 1,
      prizeAmount: totalPrize,
    });
  } else if (competition.prize_distribution === 'top-3') {
    // Top 3 split
    const config = competition.prize_config || {};
    const percentages = [
      config.firstPlace || 50,
      config.secondPlace || 30,
      config.thirdPlace || 20,
    ];

    for (let i = 0; i < Math.min(3, scoredEntries.length); i++) {
      const entry = scoredEntries[i];
      const prize = (totalPrize * percentages[i]) / 100;
      distribution[entry.agent_id] = prize;
      winners.push(entry);

      await db.updateCompetitionEntry(entry.id, {
        status: i === 0 ? 'winner' : 'scored',
        rank: i + 1,
        prizeAmount: prize,
      });
    }
  } else if (competition.prize_distribution === 'proportional') {
    // Proportional to score (above threshold)
    const minScore = competition.prize_config?.minScore || 0;
    const qualifiedEntries = scoredEntries.filter(e => (e.score || 0) >= minScore);
    
    if (qualifiedEntries.length === 0) {
      throw new Error('No entries meet minimum score threshold');
    }

    const totalScore = qualifiedEntries.reduce((sum, e) => sum + (e.score || 0), 0);

    for (let i = 0; i < qualifiedEntries.length; i++) {
      const entry = qualifiedEntries[i];
      const prize = (totalPrize * (entry.score || 0)) / totalScore;
      distribution[entry.agent_id] = prize;
      if (i === 0) winners.push(entry);

      await db.updateCompetitionEntry(entry.id, {
        status: i === 0 ? 'winner' : 'scored',
        rank: i + 1,
        prizeAmount: prize,
      });
    }
  }

  // Update competition status
  await db.updateCompetition(competitionId, {
    status: 'finalized',
    winnerId: winners[0]?.agent_id || null,
    finalizedAt: new Date().toISOString(),
  });

  // Distribute prizes (integrate with existing payment system)
  for (const [agentId, amount] of Object.entries(distribution)) {
    await distributePrize(agentId, amount, listing.currency, competition.listing_id);
  }

  return { winners, totalPrize, distribution };
}

/**
 * Get competition leaderboard (ranked submissions)
 */
export async function getLeaderboard(competitionId: string): Promise<CompetitionEntryRecord[]> {
  const entries = await db.getCompetitionEntries(competitionId);
  
  return entries
    .filter(e => e.score !== null)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((entry, index) => ({
      ...entry,
      rank: entry.rank || index + 1,
    }));
}

/**
 * Helper: Run acceptance harness against submission
 * This would integrate with existing bounty evaluation system
 */
async function runAcceptanceHarness(
  artifacts: any,
  listingId: string
): Promise<EvaluationResult> {
  // TODO: Integrate with existing acceptance harness system
  // For now, return a mock result
  const mockScore = Math.random() * 100;
  
  return {
    success: true,
    score: mockScore,
    details: {
      testsRun: 10,
      testsPassed: Math.floor(mockScore / 10),
      artifacts,
    },
    feedback: 'Harness evaluation completed',
  };
}

/**
 * Helper: Distribute prize to winner
 * Integrates with NaCl or USDC payment system
 */
async function distributePrize(
  agentId: string,
  amount: number,
  currency: string,
  listingId: string
): Promise<void> {
  if (amount <= 0) return;

  if (currency === 'usdc') {
    // TODO: Integrate with USDC escrow system
    console.log(`[Competition] Would transfer ${amount} USDC to agent ${agentId}`);
  } else {
    // NaCl transfer
    await db.transferNacl(
      null, // System transfer
      agentId,
      amount,
      'competition_prize',
      `Competition prize for listing ${listingId}`
    );
  }
}
