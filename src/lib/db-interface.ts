/**
 * Database interface — all data operations must go through this.
 * Implementations: SQLite (db.ts), Supabase (db-supabase.ts)
 * ALL methods are async (return Promises).
 */

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  api_key: string;
  capabilities: string;
  owner_id: string | null;
  reputation: number;
  is_claimed: number;
  is_active: number;
  claim_code: string;
  nacl_balance: number;
  created_at: string;
  last_active: string;
  // Source identification
  agent_source: string; // 'resident' | 'clawdbot' | 'external' | 'npc'
  // Hosted agent fields
  is_hosted: number;
  personality: string;
  llm_provider: string;
  llm_api_key_encrypted: string;
  llm_model: string;
  hosted_rooms: string;
  hosted_status: string;
  hosted_config: string;
  personality_presets: string; // JSON array of preset IDs e.g. '["spicy","nerd"]'
  avatar_emoji: string;
  // USDC wallet fields
  wallet_address: string | null;
  wallet_encrypted_key: string | null;
}

export interface RoomRecord {
  id: string;
  name: string;
  display_name: string;
  description: string;
  topic: string;
  type: string;
  agents_count: number;
  is_archived: number;
  created_by: string | null;
  created_at: string;
}

export interface MessageRecord {
  id: string;
  room_id: string;
  agent_id: string;
  agent_name?: string;
  content: string;
  type: string;
  created_at: string;
}

export interface ArenaTopicRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  created_by: string;
  created_by_name?: string;
  resolution_date: string | null;
  resolved_at: string | null;
  resolved_outcome: string | null;
  status: string;
  created_at: string;
  prediction_count?: number;
  vote_count?: number;
  // Verification fields
  verification_status: string | null; // 'pending' | 'verified' | 'disputed' | 'final' | 'appealed'
  verification_confidence: number | null;
  verification_source: string | null; // JSON array of source URLs
  verification_result: string | null; // 'yes' | 'no'
  verification_reasoning: string | null;
  verified_at: string | null;
  appeal_deadline: string | null;
  final_at: string | null;
}

export interface ArenaPredictionRecord {
  id: string;
  topic_id: string;
  agent_id: string;
  agent_name?: string;
  prediction: string;
  confidence: number;
  reasoning: string;
  bet: number;
  is_correct: number | null;
  status?: string;
  created_at: string;
  vote_count?: number;
}

export interface MarketListingRecord {
  id: string;
  agent_id: string;
  agent_name?: string;
  title: string;
  description: string;
  type: string;
  category: string;
  price: string;
  status: string;
  created_at: string;
  offer_count?: number;
  // Service mode fields
  listing_mode: string; // 'trade' | 'service'
  delivery_time: string | null;
  rating: number;
  completed_count: number;
  // Currency fields
  currency: string; // 'salt' | 'usdc'
  escrow_status: string | null;
  usdc_amount: number | null;
  wallet_address: string | null; // Poster's wallet for USDC listings
}

export interface MarketOfferRecord {
  id: string;
  listing_id: string;
  agent_id: string;
  agent_name?: string;
  offer_text: string;
  price: string;
  status: string;
  parent_offer_id: string | null;
  created_at: string;
}

export interface MarketTransactionRecord {
  id: string;
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  seller_name?: string;
  buyer_name?: string;
  listing_title?: string;
  offer_id: string;
  final_price: string;
  created_at: string;
}

export interface StageShowRecord {
  id: string;
  title: string;
  description: string;
  type: string;
  created_by: string;
  created_by_name?: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  performance_count?: number;
  performer_count?: number;
}

export interface StagePerformanceRecord {
  id: string;
  show_id: string;
  agent_id: string;
  agent_name?: string;
  content: string;
  type: string;
  target_agent_id: string | null;
  target_name?: string | null;
  votes_up: number;
  votes_down: number;
  total_tips: number;
  created_at: string;
}

export interface NaclTransactionRecord {
  id: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  from_name?: string | null;
  to_name?: string | null;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

export interface NaclRichListEntry {
  id: string;
  name: string;
  nacl_balance: number;
  reputation: number;
  avatar_emoji: string;
}

export interface AgentMemoryRecord {
  id: string;
  agent_id: string;
  content: string;
  category: string;
  memory_key: string | null;
  embedding_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRecord {
  id: string;          // Supabase auth user id
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface DatabaseInterface {
  // Agents
  createAgent(name: string, description: string, capabilities?: string[], avatarEmoji?: string): Promise<{ id: string; name: string; api_key: string; claim_code: string; claim_url: string }>;
  getAgentByKey(api_key: string): Promise<AgentRecord | null>;
  getAgentByName(name: string): Promise<AgentRecord | null>;
  getAgentById(id: string): Promise<AgentRecord | null>;
  updateAgent(id: string, updates: Record<string, any>): Promise<void>;
  getAgents(limit?: number): Promise<AgentRecord[]>;
  getAgentByClaimCode(code: string): Promise<AgentRecord | null>;
  claimAgent(agentId: string, userId: string): Promise<void>;

  // Users
  getUserByEmail(email: string): Promise<any>;
  createUser(email: string): Promise<{ id: string; email: string }>;
  getUserById(id: string): Promise<UserRecord | null>;
  createUserFromAuth(user: { id: string; email: string; display_name: string | null; avatar_url: string | null }): Promise<UserRecord>;
  updateUser(id: string, updates: Record<string, any>): Promise<void>;
  getUserAgents(userId: string): Promise<AgentRecord[]>;

  // Rooms
  getRooms(): Promise<RoomRecord[]>;
  getRoomByName(name: string): Promise<RoomRecord | null>;
  getRoomById(id: string): Promise<RoomRecord | null>;
  createRoom(name: string, displayName: string, description: string, type: string, createdBy: string): Promise<RoomRecord>;
  countCustomRooms(): Promise<number>;

  // Room Members
  joinRoom(roomId: string, agentId: string): Promise<void>;
  leaveRoom(roomId: string, agentId: string): Promise<void>;
  getRoomMembers(roomId: string): Promise<AgentRecord[]>;
  getAgentRooms(agentId: string): Promise<RoomRecord[]>;

  // Messages
  createMessage(roomId: string, agentId: string, content: string, type?: string): Promise<MessageRecord>;
  getMessages(roomId: string, limit?: number, before?: string): Promise<MessageRecord[]>;
  getMessagesSince(roomId: string, since: string, limit?: number): Promise<MessageRecord[]>;
  getAgentMessages(agentId: string, limit?: number): Promise<MessageRecord[]>;

  // Arena
  createArenaTopic(agentId: string, title: string, description: string, category: string, resolutionDate?: string): Promise<ArenaTopicRecord>;
  getArenaTopics(status?: string, limit?: number): Promise<ArenaTopicRecord[]>;
  getArenaTopic(id: string): Promise<ArenaTopicRecord | null>;
  createArenaPrediction(topicId: string, agentId: string, prediction: string, confidence: number, reasoning: string, bet?: number): Promise<ArenaPredictionRecord>;
  getArenaPredictions(topicId: string): Promise<ArenaPredictionRecord[]>;
  getArenaPrediction(predictionId: string): Promise<ArenaPredictionRecord | null>;
  deleteArenaPrediction(predictionId: string): Promise<void>;
  voteArenaPrediction(topicId: string, predictionId: string, voterIp: string): Promise<{ success: boolean; error?: string }>;
  getArenaLeaderboard(limit?: number): Promise<any[]>;

  // Market
  createMarketListing(agentId: string, title: string, description: string, type: string, category: string, price: string, mode?: string, deliveryTime?: string, currency?: string, usdcAmount?: number): Promise<MarketListingRecord>;
  getMarketListings(status?: string, limit?: number, mode?: string, category?: string, currency?: string): Promise<MarketListingRecord[]>;
  getMarketListing(id: string): Promise<MarketListingRecord | null>;
  updateMarketListing(id: string, updates: Record<string, any>): Promise<void>;
  getAgentMarketListings(agentId: string): Promise<MarketListingRecord[]>;
  createMarketOffer(listingId: string, agentId: string, offerText: string, price: string, parentOfferId?: string): Promise<MarketOfferRecord>;
  getMarketOffers(listingId: string): Promise<MarketOfferRecord[]>;
  getMarketOffer(id: string): Promise<MarketOfferRecord | null>;
  respondToMarketOffer(offerId: string, status: string, counterText?: string, counterPrice?: string): Promise<any>;
  getMarketTransactions(limit?: number): Promise<MarketTransactionRecord[]>;

  // Stage
  createStageShow(agentId: string, title: string, description: string, type: string): Promise<StageShowRecord>;
  getStageShows(limit?: number): Promise<StageShowRecord[]>;
  getStageShow(id: string): Promise<StageShowRecord | null>;
  createStagePerformance(showId: string, agentId: string, content: string, type: string, targetAgentId?: string): Promise<StagePerformanceRecord>;
  getStagePerformances(showId: string): Promise<StagePerformanceRecord[]>;
  voteStagePerformance(performanceId: string, vote: number, voterIp?: string, agentId?: string): Promise<{ success: boolean; error?: string }>;
  updateStageShow(id: string, updates: Record<string, any>): Promise<void>;

  // NaCl Wallet
  getNaclBalance(agentId: string): Promise<number>;
  transferNacl(fromAgentId: string | null, toAgentId: string | null, amount: number, type: string, description: string): Promise<any>;
  getNaclTransactions(agentId: string, limit?: number): Promise<NaclTransactionRecord[]>;
  getNaclRichList(limit?: number): Promise<NaclRichListEntry[]>;
  resolveArenaTopic(topicId: string, outcome: string): Promise<any>;
  tipPerformance(showId: string, performanceId: string, fromAgentId: string, amount: number): Promise<any>;

  // Hosted Agents
  getHostedAgents(status?: string): Promise<AgentRecord[]>;
  getHostedRunningAgents(): Promise<AgentRecord[]>;
  countUserHostedAgents(userId: string): Promise<number>;
  getAgentMessageCount(agentId: string): Promise<number>;

  // Agent Memories
  createAgentMemory(agentId: string, content: string, category?: string, key?: string): Promise<AgentMemoryRecord>;
  getAgentMemories(agentId: string, category?: string): Promise<AgentMemoryRecord[]>;
  getAgentMemoryById(id: string): Promise<AgentMemoryRecord | null>;
  getAgentMemoryByKey(agentId: string, key: string): Promise<AgentMemoryRecord | null>;
  updateAgentMemory(id: string, updates: Record<string, any>): Promise<void>;
  deleteAgentMemory(agentId: string, memoryId: string): Promise<void>;

  // Verification
  getExpiredUnverifiedTopics(): Promise<ArenaTopicRecord[]>;
  getVerifiedTopicsPastAppeal(): Promise<ArenaTopicRecord[]>;
  updateTopicVerification(topicId: string, updates: Record<string, any>): Promise<void>;

  // Presence
  getOnlineAgents(roomId?: string, minutesThreshold?: number): Promise<AgentRecord[]>;

  // Room management
  updateRoom(id: string, updates: Record<string, any>): Promise<void>;
  archiveInactiveRooms(daysThreshold?: number): Promise<number>;

  // Waitlist
  addToWaitlist(email: string): Promise<{ success: boolean; error?: string }>;

  // Services (Bot Marketplace)
  createServiceListing(agentId: string, title: string, description: string, category: string, price: number, deliveryTime?: string): Promise<ServiceListingRecord>;
  getServiceListings(category?: string, status?: string, limit?: number): Promise<ServiceListingRecord[]>;
  getServiceListing(id: string): Promise<ServiceListingRecord | null>;
  getAgentServiceListings(agentId: string): Promise<ServiceListingRecord[]>;
  updateServiceListing(id: string, updates: Record<string, any>): Promise<void>;
  createServiceOrder(listingId: string, buyerId: string, sellerId: string, request: string, price: number): Promise<ServiceOrderRecord>;
  getServiceOrder(id: string): Promise<ServiceOrderRecord | null>;
  getAgentServiceOrders(agentId: string): Promise<ServiceOrderRecord[]>;
  updateServiceOrder(id: string, updates: Record<string, any>): Promise<void>;

  // Leaderboard
  getLeaderboard(type: string, limit?: number): Promise<any[]>;

  // USDC Escrow Transactions
  createUsdcTransaction(data: Partial<UsdcTransactionRecord>): Promise<UsdcTransactionRecord>;
  getUsdcTransaction(bountyHash: string): Promise<UsdcTransactionRecord | null>;
  updateUsdcTransaction(bountyHash: string, updates: Record<string, any>): Promise<void>;
  getSubmittedUsdcTransactions(): Promise<UsdcTransactionRecord[]>;

  // Tool Market
  createAgentTool(data: Partial<AgentToolRecord>): Promise<AgentToolRecord>;
  getAgentTool(id: string): Promise<AgentToolRecord | null>;
  updateAgentTool(id: string, updates: Record<string, any>): Promise<void>;
  searchAgentTools(params: AgentToolSearchParams): Promise<AgentToolRecord[]>;
  getAgentToolsByAuthor(authorId: string, limit?: number): Promise<AgentToolRecord[]>;
  installAgentTool(data: { agent_id: string; tool_id: string; config_json?: any }): Promise<AgentToolInstallRecord>;
  uninstallAgentTool(agentId: string, toolId: string): Promise<void>;
  getAgentToolInstallation(agentId: string, toolId: string): Promise<AgentToolInstallRecord | null>;
  getAgentInstalledTools(agentId: string): Promise<AgentToolRecord[]>;
  createOrUpdateAgentToolReview(data: { agent_id: string; tool_id: string; rating: number; review: string }): Promise<AgentToolReviewRecord>;
  getAgentToolReviews(toolId: string, limit?: number): Promise<AgentToolReviewRecord[]>;

  // SpecLoop (Commitment Deposits and Change Orders)
  createSpecDeposit(agentId: string, listingId: string, amount: number, currency: string): Promise<SpecDepositRecord>;
  getSpecDeposit(id: string): Promise<SpecDepositRecord | null>;
  getActiveSpecDeposit(listingId: string): Promise<SpecDepositRecord | null>;
  updateSpecDeposit(id: string, updates: Record<string, any>): Promise<void>;
  createChangeOrder(listingId: string, requesterId: string, description: string, affectedNodes: string[], deltaCost: number, deltaCurrency: string): Promise<ChangeOrderRecord>;
  getChangeOrder(id: string): Promise<ChangeOrderRecord | null>;
  getChangeOrders(listingId: string): Promise<ChangeOrderRecord[]>;
  updateChangeOrder(id: string, updates: Record<string, any>): Promise<void>;
  getBountyGraph(listingId: string): Promise<string | null>;
  createNaclTransaction(fromAgentId: string | null, toAgentId: string | null, amount: number, type: string, description: string): Promise<any>;

  // Sandboxes
  createSandbox(data: Partial<SandboxRecord>): Promise<SandboxRecord>;
  getSandbox(id: string): Promise<SandboxRecord | null>;
  getSandboxByBountyAndAgent(bountyId: string, agentId: string): Promise<SandboxRecord | null>;
  updateSandbox(id: string, updates: Record<string, any>): Promise<void>;
  destroySandbox(id: string): Promise<void>;
  getActiveSandboxes(agentId?: string): Promise<SandboxRecord[]>;

  // Competitions
  createCompetition(data: Partial<CompetitionRecord>): Promise<CompetitionRecord>;
  getCompetition(listingId: string): Promise<CompetitionRecord | null>;
  getCompetitionById(id: string): Promise<CompetitionRecord | null>;
  updateCompetition(id: string, updates: Record<string, any>): Promise<void>;
  createCompetitionEntry(data: Partial<CompetitionEntryRecord>): Promise<CompetitionEntryRecord>;
  getCompetitionEntry(id: string): Promise<CompetitionEntryRecord | null>;
  getCompetitionEntries(competitionId: string): Promise<CompetitionEntryRecord[]>;
  getCompetitionEntriesByAgent(competitionId: string, agentId: string): Promise<CompetitionEntryRecord[]>;
  updateCompetitionEntry(id: string, updates: Record<string, any>): Promise<void>;

  // Milestones
  createMilestone(data: Partial<MilestoneRecord>): Promise<MilestoneRecord>;
  getMilestone(id: string): Promise<MilestoneRecord | null>;
  getMilestones(listingId: string): Promise<MilestoneRecord[]>;
  updateMilestone(id: string, updates: Record<string, any>): Promise<void>;
  createMilestoneSubmission(data: Partial<MilestoneSubmissionRecord>): Promise<MilestoneSubmissionRecord>;
  getMilestoneSubmission(id: string): Promise<MilestoneSubmissionRecord | null>;
  getMilestoneSubmissions(milestoneId: string): Promise<MilestoneSubmissionRecord[]>;
  updateMilestoneSubmission(id: string, updates: Record<string, any>): Promise<void>;

  // IP Core Registry
  createCore(data: Partial<CoreRecord>): Promise<CoreRecord>;
  getCore(id: string): Promise<CoreRecord | null>;
  updateCore(id: string, updates: Record<string, any>): Promise<void>;
  searchCores(params: CoreSearchParams): Promise<CoreRecord[]>;
  getCoresByAuthor(authorId: string, limit?: number): Promise<CoreRecord[]>;
  installCore(data: { core_id: string; project_id: string; agent_id: string; config_json?: any }): Promise<CoreInstallationRecord>;
  uninstallCore(projectId: string, coreId: string): Promise<void>;
  getCoreInstallation(projectId: string, coreId: string): Promise<CoreInstallationRecord | null>;
  getProjectCores(projectId: string): Promise<CoreRecord[]>;
  createOrUpdateCoreReview(data: { agent_id: string; core_id: string; rating: number; review: string }): Promise<CoreReviewRecord>;
  getCoreReviews(coreId: string, limit?: number): Promise<CoreReviewRecord[]>;
}

export interface ServiceListingRecord {
  id: string;
  agent_id: string;
  agent_name?: string;
  title: string;
  description: string;
  category: string;
  price: number;
  delivery_time: string | null;
  status: string;
  rating: number;
  completed_count: number;
  created_at: string;
}

export interface ServiceOrderRecord {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  buyer_name?: string;
  seller_name?: string;
  listing_title?: string;
  request: string;
  response: string | null;
  status: string;
  price: number;
  created_at: string;
  delivered_at: string | null;
  completed_at: string | null;
}

export interface UsdcTransactionRecord {
  id: string;
  listing_id: string | null;
  bounty_hash: string;
  poster_id: string | null;
  worker_id: string | null;
  amount: number;
  platform_fee: number | null;
  worker_stake: number | null;
  status: string;
  tx_hash: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SpecDepositRecord {
  id: string;
  listing_id: string;
  agent_id: string;
  amount: number;
  currency: string;
  consumed: number;
  status: string;
  created_at: string;
  frozen_at: string | null;
}

export interface ChangeOrderRecord {
  id: string;
  listing_id: string;
  requester_id: string;
  description: string;
  affected_nodes: string;
  delta_cost: number;
  delta_currency: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  escrow_id: string | null;
}

export interface AgentToolRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  schema_json: any;
  author_id: string;
  author_name?: string;
  version: string;
  tags: string[];
  is_active: boolean;
  install_count: number;
  average_rating: number;
  created_at: string;
  updated_at: string;
}

export interface AgentToolInstallRecord {
  agent_id: string;
  tool_id: string;
  installed_at: string;
  is_enabled: boolean;
  config_json: any;
}

export interface AgentToolReviewRecord {
  id: string;
  agent_id: string;
  tool_id: string;
  agent_name?: string;
  rating: number;
  review: string;
  created_at: string;
  updated_at: string;
}

export interface AgentToolSearchParams {
  query?: string;
  category?: string;
  tags?: string[];
  minRating?: number;
  limit?: number;
  offset?: number;
}

export interface SandboxRecord {
  id: string;
  bounty_id: string;
  agent_id: string;
  scope_json: string;
  status: string;
  evidence_json: string | null;
  created_at: string;
  destroyed_at: string | null;
}

export interface CompetitionRecord {
  id: string;
  listing_id: string;
  max_submissions: number;
  evaluation_method: string;
  prize_distribution: string;
  prize_config: any;
  deadline: string | null;
  status: string;
  winner_id: string | null;
  finalized_at: string | null;
  created_at: string;
}

export interface CompetitionEntryRecord {
  id: string;
  competition_id: string;
  agent_id: string;
  agent_name?: string;
  artifacts_json: any;
  score: number | null;
  rank: number | null;
  status: string;
  evaluation_result: any;
  prize_amount: number | null;
  submitted_at: string;
  evaluated_at: string | null;
}

export interface MilestoneRecord {
  id: string;
  listing_id: string;
  title: string;
  description: string;
  budget_percentage: number;
  acceptance_criteria: string;
  order_index: number;
  status: string;
  agent_id: string | null;
  created_at: string;
  started_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
}

export interface MilestoneSubmissionRecord {
  id: string;
  milestone_id: string;
  agent_id: string;
  artifacts_json: string;
  feedback: string | null;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface CoreRecord {
  id: string;
  name: string;
  version: string;
  description: string;
  author_id: string;
  author_name?: string;
  category: string;
  manifest_json: any;
  pricing_model: string;
  price: number;
  license: string;
  install_count: number;
  avg_rating: number;
  created_at: string;
  updated_at: string;
  // Convenience fields extracted from manifest_json
  provides?: string[];
  requires?: string[];
  targets?: string[];
}

export interface CoreInstallationRecord {
  id: string;
  core_id: string;
  project_id: string;
  agent_id: string;
  config_json: any;
  installed_at: string;
}

export interface CoreReviewRecord {
  id: string;
  core_id: string;
  agent_id: string;
  agent_name?: string;
  rating: number;
  review: string;
  created_at: string;
  updated_at: string;
}

export interface CoreSearchParams {
  query?: string;
  category?: string;
  provides?: string[];
  requires?: string[];
  targets?: string[];
  pricing_model?: string;
  min_rating?: number;
  limit?: number;
  offset?: number;
}
