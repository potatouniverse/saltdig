/**
 * SpecLoop Economic Model
 * 
 * Implements commitment deposits and change orders for the bounty specification process.
 * 
 * Flow:
 * 1. Agent creates spec deposit when entering Clarify phase
 * 2. Deposit is consumed incrementally to pay spec reviewers
 * 3. When spec is frozen, remaining deposit converts to budget credit
 * 4. After freeze, changes require change orders with impact analysis
 * 5. Approved change orders create new escrow for delta cost
 */

import { db } from './db-factory';
import * as yaml from 'js-yaml';

export interface SpecDeposit {
  id: string;
  listing_id: string;
  agent_id: string;
  amount: number;
  currency: string; // 'NACL' | 'USDC'
  consumed: number;
  status: string;
  created_at: string;
  frozen_at?: string | null;
}

export interface ChangeOrder {
  id: string;
  listing_id: string;
  requester_id: string;
  description: string;
  affected_nodes: string[] | string; // Array of node IDs from graph (may be JSON string from DB)
  delta_cost: number;
  delta_currency: string;
  status: string;
  impact_analysis?: ImpactAnalysis;
  created_at: string;
  approved_at?: string | null;
  escrow_id?: string | null; // ID of escrow created for this change
}

export interface ImpactAnalysis {
  changed_nodes: string[];
  directly_affected: string[];
  transitively_affected: string[];
  total_affected_count: number;
  estimated_cost_increase: number;
  risk_level: 'low' | 'medium' | 'high';
  reasoning: string;
}

export interface GraphNode {
  id: string;
  status: string;
  depends?: string[];
  cost?: number;
  [key: string]: any;
}

export interface BountyGraph {
  nodes: GraphNode[];
  [key: string]: any;
}

/**
 * Create a spec deposit when entering the Clarify phase
 */
export async function createSpecDeposit(
  agentId: string,
  listingId: string,
  amount: number,
  currency: 'NACL' | 'USDC' = 'NACL'
): Promise<SpecDeposit> {
  // Verify the agent owns this listing
  const listing = await db.getMarketListing(listingId);
  if (!listing) {
    throw new Error('Listing not found');
  }
  if (listing.agent_id !== agentId) {
    throw new Error('Only the listing owner can create a spec deposit');
  }

  // Verify listing is in correct state for spec deposit
  if (listing.status !== 'active' && listing.status !== 'clarifying') {
    throw new Error('Listing must be active or clarifying to create spec deposit');
  }

  // Check if agent has sufficient balance
  const agent = await db.getAgentById(agentId);
  if (!agent) {
    throw new Error('Agent not found');
  }

  if (currency === 'NACL') {
    if (agent.nacl_balance < amount) {
      throw new Error('Insufficient NACL balance');
    }
    // Deduct from agent's balance
    await db.updateAgent(agentId, {
      nacl_balance: agent.nacl_balance - amount
    });
  } else {
    // TODO: Implement USDC balance check and deduction
    throw new Error('USDC deposits not yet implemented');
  }

  // Create the deposit
  const deposit = await db.createSpecDeposit(agentId, listingId, amount, currency);

  // Update listing status to clarifying
  await db.updateMarketListing(listingId, { status: 'clarifying' });

  return deposit;
}

/**
 * Consume a portion of the spec deposit (pays spec reviewers)
 */
export async function consumeSpecDeposit(
  listingId: string,
  reason: string,
  amount: number
): Promise<SpecDeposit> {
  const deposit = await db.getActiveSpecDeposit(listingId);
  if (!deposit) {
    throw new Error('No active spec deposit found for this listing');
  }

  const remaining = deposit.amount - deposit.consumed;
  if (amount > remaining) {
    throw new Error(`Insufficient deposit: ${remaining} ${deposit.currency} remaining, ${amount} requested`);
  }

  // Update consumed amount
  const newConsumed = deposit.consumed + amount;
  const status = newConsumed >= deposit.amount ? 'consumed' : 'active';
  
  await db.updateSpecDeposit(deposit.id, {
    consumed: newConsumed,
    status
  });

  // Record the consumption as a transaction
  await db.createNaclTransaction(
    deposit.agent_id,
    null, // to spec reviewers (distributed separately)
    amount,
    'spec_review_payment',
    reason
  );

  return {
    ...deposit,
    consumed: newConsumed,
    status
  };
}

/**
 * Freeze the spec - transition from Clarifying → Frozen
 * Converts remaining deposit to budget credit
 */
export async function freezeSpec(listingId: string, agentId: string): Promise<{
  deposit: SpecDeposit;
  creditApplied: number;
}> {
  const listing = await db.getMarketListing(listingId);
  if (!listing) {
    throw new Error('Listing not found');
  }
  if (listing.agent_id !== agentId) {
    throw new Error('Only the listing owner can freeze the spec');
  }
  if (listing.status !== 'clarifying') {
    throw new Error('Listing must be in clarifying state to freeze');
  }

  const deposit = await db.getActiveSpecDeposit(listingId);
  if (!deposit) {
    throw new Error('No active spec deposit found');
  }

  // Calculate remaining deposit
  const creditAmount = deposit.amount - deposit.consumed;

  // Update deposit status
  await db.updateSpecDeposit(deposit.id, {
    status: 'frozen',
    frozen_at: new Date().toISOString()
  });

  // Update listing status to frozen
  await db.updateMarketListing(listingId, { status: 'frozen' });

  // Credit remaining deposit back to agent
  if (creditAmount > 0) {
    const agent = await db.getAgentById(agentId);
    if (agent) {
      await db.updateAgent(agentId, {
        nacl_balance: agent.nacl_balance + creditAmount
      });

      // Record the credit
      await db.createNaclTransaction(
        null,
        agentId,
        creditAmount,
        'spec_freeze_credit',
        `Remaining spec deposit returned on freeze for listing ${listingId}`
      );
    }
  }

  return {
    deposit: {
      ...deposit,
      status: 'frozen',
      frozen_at: new Date().toISOString()
    },
    creditApplied: creditAmount
  };
}

/**
 * Create a change order after spec freeze
 */
export async function createChangeOrder(
  listingId: string,
  requesterId: string,
  affectedNodeIds: string[],
  description: string
): Promise<ChangeOrder> {
  const listing = await db.getMarketListing(listingId);
  if (!listing) {
    throw new Error('Listing not found');
  }
  if (listing.status !== 'frozen') {
    throw new Error('Change orders can only be created for frozen specs');
  }

  // Get the bounty graph to calculate impact
  const graphYaml = await db.getBountyGraph(listingId);
  if (!graphYaml) {
    throw new Error('No bounty graph found for this listing');
  }

  // Calculate impact
  const impact = await calculateChangeImpact(graphYaml, affectedNodeIds);

  // Create the change order
  const changeOrder = await db.createChangeOrder(
    listingId,
    requesterId,
    description,
    affectedNodeIds,
    impact.estimated_cost_increase,
    'NACL' // Default currency
  );

  return {
    ...changeOrder,
    impact_analysis: impact
  };
}

/**
 * Calculate the impact of changing specific nodes in the dependency graph
 */
export async function calculateChangeImpact(
  graphYaml: string,
  changedNodeIds: string[]
): Promise<ImpactAnalysis> {
  let graph: BountyGraph;
  try {
    graph = yaml.load(graphYaml) as BountyGraph;
  } catch (error) {
    throw new Error('Invalid graph YAML');
  }

  if (!graph.nodes || !Array.isArray(graph.nodes)) {
    throw new Error('Graph must contain a nodes array');
  }

  // Build dependency map (reverse: who depends on this node)
  const dependents = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    if (node.depends && Array.isArray(node.depends)) {
      for (const dep of node.depends) {
        if (!dependents.has(dep)) {
          dependents.set(dep, new Set());
        }
        dependents.get(dep)!.add(node.id);
      }
    }
  }

  // Find all affected nodes via BFS
  const directlyAffected = new Set<string>();
  const transitivelyAffected = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = changedNodeIds.map(id => ({ id, depth: 0 }));
  const visited = new Set<string>(changedNodeIds);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const deps = dependents.get(id);
    
    if (deps) {
      for (const depId of deps) {
        if (!visited.has(depId)) {
          visited.add(depId);
          if (depth === 0) {
            directlyAffected.add(depId);
          } else {
            transitivelyAffected.add(depId);
          }
          queue.push({ id: depId, depth: depth + 1 });
        }
      }
    }
  }

  // Calculate cost impact
  let estimatedCostIncrease = 0;
  const affectedNodes = [...changedNodeIds, ...directlyAffected, ...transitivelyAffected];
  for (const nodeId of affectedNodes) {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (node?.cost) {
      // Estimate 20% rework cost for affected nodes
      estimatedCostIncrease += node.cost * 0.2;
    }
  }

  // Determine risk level
  const totalAffected = affectedNodes.length;
  let riskLevel: 'low' | 'medium' | 'high';
  if (totalAffected <= 2) {
    riskLevel = 'low';
  } else if (totalAffected <= 5) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'high';
  }

  return {
    changed_nodes: changedNodeIds,
    directly_affected: Array.from(directlyAffected),
    transitively_affected: Array.from(transitivelyAffected),
    total_affected_count: totalAffected,
    estimated_cost_increase: Math.ceil(estimatedCostIncrease),
    risk_level: riskLevel,
    reasoning: `Changing ${changedNodeIds.length} node(s) will directly affect ${directlyAffected.size} node(s) and transitively affect ${transitivelyAffected.size} more node(s). Total affected: ${totalAffected}. Risk level: ${riskLevel}.`
  };
}

/**
 * Approve a change order and create escrow for delta cost
 */
export async function approveChangeOrder(
  changeOrderId: string,
  approverId: string
): Promise<ChangeOrder> {
  const changeOrder = await db.getChangeOrder(changeOrderId);
  if (!changeOrder) {
    throw new Error('Change order not found');
  }

  const listing = await db.getMarketListing(changeOrder.listing_id);
  if (!listing) {
    throw new Error('Listing not found');
  }

  // Verify approver is the listing owner
  if (listing.agent_id !== approverId) {
    throw new Error('Only the listing owner can approve change orders');
  }

  if (changeOrder.status !== 'pending') {
    throw new Error('Change order is not pending');
  }

  // Update change order status
  await db.updateChangeOrder(changeOrderId, {
    status: 'approved',
    approved_at: new Date().toISOString()
  });

  // TODO: Create escrow for delta cost
  // This would integrate with the existing escrow system
  // For now, we just mark it as approved

  return {
    ...changeOrder,
    status: 'approved',
    approved_at: new Date().toISOString()
  };
}
