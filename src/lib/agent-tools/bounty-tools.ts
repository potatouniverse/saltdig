/**
 * Bounty Tools — Tool definitions for agents to discover, evaluate, and claim bounties
 */

import { db } from "../db-factory";
import { escrowClient, computeBountyHash } from "../escrow";
import type { MarketListingRecord } from "../db-interface";

export interface BountyFilters {
  category?: string;
  minBudget?: number;
  maxBudget?: number;
  mode?: "trade" | "service";
  status?: string;
  limit?: number;
}

export interface BountyEvaluation {
  listing: MarketListingRecord;
  onChainStatus?: {
    status: string;
    poster: string;
    worker: string;
    amount: string;
    deadline: number;
  };
  feasibility: {
    matchScore: number;
    budgetMatch: boolean;
    estimatedHours?: number;
    risks?: string[];
  };
}

export interface WorkArtifact {
  type: "text" | "url" | "file";
  content: string;
  description?: string;
}

/**
 * Search available bounties by filters
 */
export async function search_bounties(filters: BountyFilters = {}): Promise<MarketListingRecord[]> {
  const {
    category,
    minBudget,
    maxBudget,
    mode = "service",
    status = "active",
    limit = 50,
  } = filters;

  let listings = await db.getMarketListings(status, limit, mode, category);

  // Filter by budget if specified
  if (minBudget !== undefined || maxBudget !== undefined) {
    listings = listings.filter((listing) => {
      const price = parseFloat(listing.price);
      if (minBudget !== undefined && price < minBudget) return false;
      if (maxBudget !== undefined && price > maxBudget) return false;
      return true;
    });
  }

  return listings;
}

/**
 * Evaluate a bounty — get details, on-chain status, and estimate feasibility
 */
export async function evaluate_bounty(listingId: string): Promise<BountyEvaluation | null> {
  const listing = await db.getMarketListing(listingId);
  if (!listing) return null;

  // Check on-chain status if it's a USDC bounty
  let onChainStatus;
  try {
    const bountyHash = computeBountyHash(listingId);
    const bounty = await escrowClient.getBounty(bountyHash);
    onChainStatus = {
      status: bounty.statusLabel,
      poster: bounty.poster,
      worker: bounty.worker,
      amount: bounty.amount,
      deadline: bounty.deadline,
    };
  } catch (e) {
    // Not on-chain or error — continue without it
    onChainStatus = undefined;
  }

  // Basic feasibility estimation
  const price = parseFloat(listing.price);
  const estimatedHours = estimateWorkHours(listing);
  const risks = identifyRisks(listing);

  return {
    listing,
    onChainStatus,
    feasibility: {
      matchScore: 0, // Will be computed by matcher
      budgetMatch: price >= 10, // Minimum viable bounty
      estimatedHours,
      risks,
    },
  };
}

/**
 * Claim a bounty — calls the escrow claim API
 */
export async function claim_bounty(
  listingId: string,
  agentId: string,
  walletEncryptedKey: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const listing = await db.getMarketListing(listingId);
    if (!listing) return { success: false, error: "Listing not found" };
    if (listing.status !== "active") return { success: false, error: "Listing is not active" };
    if (listing.listing_mode !== "service") return { success: false, error: "Can only claim service listings" };

    const bountyHash = computeBountyHash(listingId);
    const txHash = await escrowClient.claimBounty(walletEncryptedKey, bountyHash);

    // Update DB
    const price = parseFloat(listing.price);
    await db.createUsdcTransaction({
      listing_id: listingId,
      bounty_hash: bountyHash,
      worker_id: agentId,
      amount: price,
      worker_stake: price * 0.1,
      status: "claimed",
      tx_hash: txHash,
    });

    return { success: true, txHash };
  } catch (e: any) {
    return { success: false, error: e.message || "Claim failed" };
  }
}

/**
 * Submit completed work for a bounty
 */
export async function submit_work(
  orderId: string,
  artifacts: WorkArtifact[],
  agentId: string,
  walletEncryptedKey: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const order = await db.getServiceOrder(orderId);
    if (!order) return { success: false, error: "Order not found" };
    if (order.seller_id !== agentId) return { success: false, error: "Not authorized" };
    if (order.status !== "pending") return { success: false, error: "Order is not in pending state" };

    // Format artifacts into response text
    const responseText = formatArtifacts(artifacts);

    // Submit to blockchain
    const txRecord = await db.getUsdcTransaction(computeBountyHash(order.listing_id || ""));
    if (!txRecord) return { success: false, error: "No escrow transaction found" };

    const txHash = await escrowClient.submitBounty(walletEncryptedKey, txRecord.bounty_hash);

    // Update order
    await db.updateServiceOrder(orderId, {
      response: responseText,
      status: "delivered",
      delivered_at: new Date().toISOString(),
    });

    await db.updateUsdcTransaction(txRecord.bounty_hash, {
      status: "submitted",
      tx_hash: txHash,
    });

    return { success: true, txHash };
  } catch (e: any) {
    return { success: false, error: e.message || "Submit failed" };
  }
}

/**
 * Check the current status of a bounty order
 */
export async function check_bounty_status(orderId: string): Promise<{
  order?: any;
  onChainStatus?: any;
  error?: string;
}> {
  try {
    const order = await db.getServiceOrder(orderId);
    if (!order) return { error: "Order not found" };

    // Check on-chain status
    const txRecord = await db.getUsdcTransaction(computeBountyHash(order.listing_id || ""));
    let onChainStatus;
    if (txRecord) {
      try {
        const bounty = await escrowClient.getBounty(txRecord.bounty_hash);
        onChainStatus = {
          status: bounty.statusLabel,
          amount: bounty.amount,
          worker: bounty.worker,
          submittedAt: bounty.submittedAt,
        };
      } catch (e) {
        // Ignore on-chain errors
      }
    }

    return { order, onChainStatus };
  } catch (e: any) {
    return { error: e.message || "Status check failed" };
  }
}

// --- Helper functions ---

function estimateWorkHours(listing: MarketListingRecord): number {
  // Simple heuristic based on price and category
  const price = parseFloat(listing.price);
  const hourlyRate = 50; // Assume $50/hour

  // Category multipliers
  const categoryMultiplier: Record<string, number> = {
    code: 1.2,
    research: 1.0,
    writing: 0.8,
    analysis: 1.1,
    creative: 1.5,
    other: 1.0,
    general: 1.0,
  };

  const multiplier = categoryMultiplier[listing.category] || 1.0;
  return Math.ceil((price / hourlyRate) * multiplier);
}

function identifyRisks(listing: MarketListingRecord): string[] {
  const risks: string[] = [];
  const price = parseFloat(listing.price);

  if (price < 20) {
    risks.push("Low budget may indicate unclear scope");
  }

  if (!listing.description || listing.description.length < 50) {
    risks.push("Insufficient description — scope unclear");
  }

  if (listing.delivery_time && parseDeliveryTime(listing.delivery_time) < 24) {
    risks.push("Very tight deadline");
  }

  return risks;
}

function parseDeliveryTime(deliveryTime: string): number {
  // Parse delivery time string like "1 day", "3 days", "1 week"
  const match = deliveryTime.match(/(\d+)\s*(hour|day|week)/i);
  if (!match) return 24; // default 1 day

  const num = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "hour") return num;
  if (unit === "day") return num * 24;
  if (unit === "week") return num * 24 * 7;
  return 24;
}

function formatArtifacts(artifacts: WorkArtifact[]): string {
  return artifacts
    .map((art) => {
      const desc = art.description ? `**${art.description}**\n` : "";
      if (art.type === "url") {
        return `${desc}🔗 ${art.content}`;
      } else if (art.type === "file") {
        return `${desc}📎 ${art.content}`;
      } else {
        return `${desc}${art.content}`;
      }
    })
    .join("\n\n---\n\n");
}

// Tool definitions for LLM agents (OpenAI function calling format)
export const bountyToolDefinitions = [
  {
    type: "function",
    function: {
      name: "search_bounties",
      description:
        "Search for available bounties by category, budget range, and other filters. Returns a list of bounty listings.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["research", "writing", "analysis", "creative", "code", "other", "general"],
            description: "Filter by bounty category",
          },
          minBudget: {
            type: "number",
            description: "Minimum bounty price in USDC",
          },
          maxBudget: {
            type: "number",
            description: "Maximum bounty price in USDC",
          },
          mode: {
            type: "string",
            enum: ["trade", "service"],
            description: "Listing mode filter (default: service)",
          },
          status: {
            type: "string",
            enum: ["active", "completed", "cancelled"],
            description: "Bounty status filter (default: active)",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50, max: 100)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "evaluate_bounty",
      description:
        "Get detailed information about a specific bounty, including on-chain status and feasibility assessment.",
      parameters: {
        type: "object",
        properties: {
          listingId: {
            type: "string",
            description: "The bounty listing ID",
          },
        },
        required: ["listingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "claim_bounty",
      description:
        "Claim a bounty by staking the required USDC. This commits you to completing the work.",
      parameters: {
        type: "object",
        properties: {
          listingId: {
            type: "string",
            description: "The bounty listing ID to claim",
          },
        },
        required: ["listingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_work",
      description:
        "Submit completed work for a bounty you've claimed. Include all deliverables and artifacts.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The service order ID",
          },
          artifacts: {
            type: "array",
            description: "Array of work artifacts (text, URLs, or files)",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["text", "url", "file"],
                  description: "Type of artifact",
                },
                content: {
                  type: "string",
                  description: "The artifact content (text, URL, or file path)",
                },
                description: {
                  type: "string",
                  description: "Optional description of the artifact",
                },
              },
              required: ["type", "content"],
            },
          },
        },
        required: ["orderId", "artifacts"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_bounty_status",
      description:
        "Check the current status of a bounty order, including on-chain verification.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The service order ID",
          },
        },
        required: ["orderId"],
      },
    },
  },
];
