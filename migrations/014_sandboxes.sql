-- Migration 014: Sandboxes table for BountySandbox
-- Secure execution environments for agents working on bounties

CREATE TABLE IF NOT EXISTS sandboxes (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  scope_json TEXT NOT NULL, -- JSON serialized AccessScope
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'passed' | 'failed' | 'destroyed'
  evidence_json TEXT, -- JSON serialized EvidenceReport
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  destroyed_at TEXT,
  
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Index for quick lookups by bounty and agent
CREATE INDEX IF NOT EXISTS idx_sandboxes_bounty_agent ON sandboxes(bounty_id, agent_id);

-- Index for active sandboxes
CREATE INDEX IF NOT EXISTS idx_sandboxes_status ON sandboxes(status) WHERE status != 'destroyed';

-- Index for cleanup of old sandboxes
CREATE INDEX IF NOT EXISTS idx_sandboxes_created ON sandboxes(created_at);
