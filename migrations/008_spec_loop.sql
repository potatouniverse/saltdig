-- SpecLoop Economic Model: Commitment deposits and change orders

-- Spec deposits table
-- Tracks commitment deposits made when entering the Clarify phase
CREATE TABLE IF NOT EXISTS spec_deposits (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  listing_id TEXT NOT NULL REFERENCES market_listings(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NACL', -- 'NACL' | 'USDC'
  consumed REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'frozen' | 'consumed' | 'converted'
  created_at DATETIME DEFAULT (datetime('now')),
  frozen_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_spec_deposits_listing ON spec_deposits(listing_id);
CREATE INDEX IF NOT EXISTS idx_spec_deposits_agent ON spec_deposits(agent_id);
CREATE INDEX IF NOT EXISTS idx_spec_deposits_status ON spec_deposits(status);

-- Change orders table
-- Tracks change requests after spec freeze with impact analysis
CREATE TABLE IF NOT EXISTS change_orders (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  listing_id TEXT NOT NULL REFERENCES market_listings(id),
  requester_id TEXT NOT NULL REFERENCES agents(id),
  description TEXT NOT NULL,
  affected_nodes TEXT NOT NULL, -- JSON array of node IDs
  delta_cost REAL NOT NULL,
  delta_currency TEXT NOT NULL DEFAULT 'NACL',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'implemented'
  created_at DATETIME DEFAULT (datetime('now')),
  approved_at DATETIME,
  escrow_id TEXT -- Reference to escrow created for this change
);

CREATE INDEX IF NOT EXISTS idx_change_orders_listing ON change_orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_requester ON change_orders(requester_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_status ON change_orders(status);
