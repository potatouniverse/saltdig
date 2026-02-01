/**
 * Bounty Agent Runner — Enables agents to auto-discover, evaluate, and work on bounties
 *
 * Usage:
 *   AGENT_API_KEY=... npx tsx src/lib/bounty-agent-runner.ts
 *
 * Options:
 *   --once              Run once and exit (default: loop every 1 hour)
 *   --interval <hours>  Interval in hours between checks (default: 1)
 *   --auto-claim        Automatically claim high-scoring bounties (default: false)
 *   --min-score <n>     Minimum match score to consider (default: 70)
 *
 * Environment:
 *   AGENT_API_KEY               — Required: Agent's API key
 *   BOUNTY_AGENT_INTERVAL       — Hours between bounty checks (default: 1)
 *   BOUNTY_AUTO_CLAIM          — "true" to enable auto-claiming (default: false)
 *   BOUNTY_MIN_SCORE           — Minimum match score (default: 70)
 *   BOUNTY_PREFERRED_CATEGORIES — Comma-separated list (e.g., "code,research")
 *   BOUNTY_HOURLY_RATE         — Agent's hourly rate in USDC (default: 50)
 *   BOUNTY_MAX_HOURS_WEEK      — Max hours per week (default: 20)
 */

import { db } from "./db-factory";
import { matchAgentToBounties, buildAgentProfile } from "./bounty-matcher";
import { search_bounties, evaluate_bounty, claim_bounty } from "./agent-tools/bounty-tools";

interface BountyAgentConfig {
  apiKey: string;
  interval: number;
  autoClaim: boolean;
  minScore: number;
  preferredCategories?: string[];
  hourlyRate?: number;
  maxHoursPerWeek?: number;
}

function getConfig(): BountyAgentConfig {
  const apiKey = process.env.AGENT_API_KEY;
  if (!apiKey) {
    throw new Error("AGENT_API_KEY environment variable is required");
  }

  const args = process.argv.slice(2);
  const intervalArg = args.find((arg) => arg.startsWith("--interval"));
  const minScoreArg = args.find((arg) => arg.startsWith("--min-score"));

  const interval = intervalArg
    ? parseInt(intervalArg.split("=")[1] || args[args.indexOf(intervalArg) + 1])
    : parseInt(process.env.BOUNTY_AGENT_INTERVAL || "1");

  const autoClaim =
    args.includes("--auto-claim") || process.env.BOUNTY_AUTO_CLAIM === "true";

  const minScore = minScoreArg
    ? parseInt(minScoreArg.split("=")[1] || args[args.indexOf(minScoreArg) + 1])
    : parseInt(process.env.BOUNTY_MIN_SCORE || "70");

  const preferredCategories = process.env.BOUNTY_PREFERRED_CATEGORIES
    ? process.env.BOUNTY_PREFERRED_CATEGORIES.split(",").map((s) => s.trim())
    : undefined;

  const hourlyRate = process.env.BOUNTY_HOURLY_RATE
    ? parseFloat(process.env.BOUNTY_HOURLY_RATE)
    : undefined;

  const maxHoursPerWeek = process.env.BOUNTY_MAX_HOURS_WEEK
    ? parseFloat(process.env.BOUNTY_MAX_HOURS_WEEK)
    : undefined;

  return {
    apiKey,
    interval,
    autoClaim,
    minScore,
    preferredCategories,
    hourlyRate,
    maxHoursPerWeek,
  };
}

async function runBountyAgentCycle(config: BountyAgentConfig): Promise<{
  evaluated: number;
  highScoring: number;
  claimed: number;
}> {
  console.log("[BountyAgent] Starting bounty discovery cycle...");

  // Get agent record
  const agent = await db.getAgentByKey(config.apiKey);
  if (!agent) {
    throw new Error("Agent not found with provided API key");
  }

  console.log(`[BountyAgent] Running as: ${agent.name} (${agent.id})`);

  // Build agent profile
  const agentProfile = buildAgentProfile(agent, {
    preferredCategories: config.preferredCategories,
    hourlyRate: config.hourlyRate,
    maxHoursPerWeek: config.maxHoursPerWeek,
  });

  // Search for available bounties
  const bounties = await search_bounties({
    mode: "service",
    status: "active",
    limit: 100,
  });

  console.log(`[BountyAgent] Found ${bounties.length} active bounties`);

  // Match and rank bounties
  const matches = await matchAgentToBounties(agentProfile, bounties, {
    minScore: config.minScore,
    maxResults: 10,
  });

  console.log(`[BountyAgent] Found ${matches.length} bounties matching criteria (score >= ${config.minScore})`);

  let claimed = 0;
  const highScoring = matches.filter((m) => m.score >= 80).length;

  // Report top matches
  for (const match of matches.slice(0, 5)) {
    console.log(`[BountyAgent] 🎯 Match Score ${match.score}:`);
    console.log(`  Title: ${match.listing.title}`);
    console.log(`  Budget: $${match.listing.price} (~${match.estimatedHours}h @ $${match.hourlyRate.toFixed(2)}/h)`);
    console.log(`  Category: ${match.listing.category}`);
    console.log(`  Reasons: ${match.reasons.join(", ")}`);
    if (match.concerns.length > 0) {
      console.log(`  ⚠️  Concerns: ${match.concerns.join(", ")}`);
    }

    // Auto-claim if enabled and score is high enough
    if (config.autoClaim && match.score >= 85 && agent.wallet_encrypted_key) {
      console.log(`[BountyAgent] 🤖 Auto-claiming bounty: ${match.listing.id}`);

      const evaluation = await evaluate_bounty(match.listing.id);
      if (evaluation?.onChainStatus?.status === "open") {
        const result = await claim_bounty(
          match.listing.id,
          agent.id,
          agent.wallet_encrypted_key
        );

        if (result.success) {
          console.log(`[BountyAgent] ✅ Successfully claimed! TX: ${result.txHash}`);
          claimed++;
        } else {
          console.log(`[BountyAgent] ❌ Claim failed: ${result.error}`);
        }
      } else {
        console.log(
          `[BountyAgent] ⏭️  Skipping (already claimed or not on-chain): ${evaluation?.onChainStatus?.status || "unknown"}`
        );
      }
    }
  }

  if (!config.autoClaim && matches.length > 0) {
    console.log(
      `[BountyAgent] 💡 Tip: Enable --auto-claim to automatically claim high-scoring bounties (score >= 85)`
    );
  }

  return {
    evaluated: bounties.length,
    highScoring,
    claimed,
  };
}

async function main() {
  const config = getConfig();
  const once = process.argv.includes("--once");

  console.log("[BountyAgent] Starting Bounty Agent Runner...");
  console.log(`[BountyAgent] Mode: ${once ? "single run" : `loop every ${config.interval}h`}`);
  console.log(`[BountyAgent] Auto-claim: ${config.autoClaim ? "ENABLED" : "disabled"}`);
  console.log(`[BountyAgent] Min score: ${config.minScore}`);
  if (config.preferredCategories) {
    console.log(`[BountyAgent] Preferred categories: ${config.preferredCategories.join(", ")}`);
  }
  if (config.hourlyRate) {
    console.log(`[BountyAgent] Hourly rate: $${config.hourlyRate}`);
  }
  if (config.maxHoursPerWeek) {
    console.log(`[BountyAgent] Max hours/week: ${config.maxHoursPerWeek}`);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await runBountyAgentCycle(config);
      console.log(
        `[BountyAgent] Cycle complete: ${result.evaluated} evaluated, ${result.highScoring} high-scoring, ${result.claimed} claimed`
      );
    } catch (err) {
      console.error("[BountyAgent] Cycle error:", err);
    }

    if (once) break;

    console.log(`[BountyAgent] Sleeping ${config.interval}h...`);
    await new Promise((resolve) => setTimeout(resolve, config.interval * 60 * 60 * 1000));
  }
}

main().catch((err) => {
  console.error("[BountyAgent] Fatal error:", err);
  process.exit(1);
});
