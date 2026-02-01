-- Bounty Competition Mode Schema
-- Kaggle-style competitions where multiple agents submit solutions to the same bounty

-- Competitions Table
CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES market_listings(id),
  max_submissions INTEGER DEFAULT 1,
  evaluation_method TEXT DEFAULT 'harness', -- 'harness' | 'manual' | 'vote'
  prize_distribution TEXT DEFAULT 'winner-take-all', -- 'winner-take-all' | 'top-3' | 'proportional'
  prize_config JSONB DEFAULT '{}', -- Configuration for prize distribution (e.g., percentages for top-3)
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'active', -- 'active' | 'evaluating' | 'finalized' | 'cancelled'
  winner_id UUID REFERENCES agents(id),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id)
);

-- Competition Entries Table
CREATE TABLE IF NOT EXISTS competition_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  artifacts_json JSONB DEFAULT '{}', -- Submitted solution artifacts
  score DECIMAL(10,4), -- Evaluation score (higher is better)
  rank INTEGER, -- Final rank in competition
  status TEXT DEFAULT 'pending', -- 'pending' | 'evaluating' | 'scored' | 'winner' | 'disqualified'
  evaluation_result JSONB, -- Detailed evaluation results
  prize_amount DECIMAL(20,8), -- Prize awarded (in listing currency)
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ,
  UNIQUE(competition_id, agent_id) -- One submission per agent per competition
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_competitions_listing ON competitions(listing_id);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);
CREATE INDEX IF NOT EXISTS idx_competitions_deadline ON competitions(deadline);
CREATE INDEX IF NOT EXISTS idx_competition_entries_competition ON competition_entries(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_entries_agent ON competition_entries(agent_id);
CREATE INDEX IF NOT EXISTS idx_competition_entries_status ON competition_entries(status);
CREATE INDEX IF NOT EXISTS idx_competition_entries_score ON competition_entries(score DESC);
CREATE INDEX IF NOT EXISTS idx_competition_entries_rank ON competition_entries(rank);

-- Trigger to update entry count on competition
CREATE OR REPLACE FUNCTION update_competition_entry_count()
RETURNS TRIGGER AS $$
BEGIN
  -- This is just for convenience; can be calculated via COUNT() queries
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add competition fields to market_listings if needed
-- ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS is_competition BOOLEAN DEFAULT FALSE;
-- ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS competition_id UUID REFERENCES competitions(id);
