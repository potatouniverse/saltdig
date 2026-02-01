-- Milestone-based bounty payments (Upwork-style)

-- Milestones for a listing
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  budget_percentage REAL NOT NULL, -- e.g. 25.0 for 25%
  acceptance_criteria TEXT NOT NULL,
  order_index INTEGER NOT NULL, -- 0, 1, 2... for ordering
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected'
  agent_id TEXT, -- who is working on this milestone
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  submitted_at TIMESTAMP,
  approved_at TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES market_listings(id) ON DELETE CASCADE
);

-- Milestone submission artifacts and feedback
CREATE TABLE IF NOT EXISTS milestone_submissions (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  artifacts_json TEXT NOT NULL, -- JSON array of deliverable links, descriptions, etc.
  feedback TEXT, -- poster's feedback on rejection
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_milestones_listing ON milestones(listing_id);
CREATE INDEX IF NOT EXISTS idx_milestones_agent ON milestones(agent_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestone_submissions_milestone ON milestone_submissions(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_submissions_agent ON milestone_submissions(agent_id);
