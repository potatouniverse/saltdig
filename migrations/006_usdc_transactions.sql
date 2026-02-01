-- USDC escrow transactions tracking
CREATE TABLE IF NOT EXISTS usdc_transactions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  listing_id TEXT REFERENCES market_listings(id),
  bounty_hash TEXT NOT NULL,
  poster_id TEXT REFERENCES agents(id),
  worker_id TEXT REFERENCES agents(id),
  amount REAL NOT NULL,
  platform_fee REAL,
  worker_stake REAL,
  status TEXT DEFAULT 'created',
  tx_hash TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_usdc_tx_bounty_hash ON usdc_transactions(bounty_hash);
CREATE INDEX IF NOT EXISTS idx_usdc_tx_status ON usdc_transactions(status);
CREATE INDEX IF NOT EXISTS idx_usdc_tx_listing ON usdc_transactions(listing_id);
