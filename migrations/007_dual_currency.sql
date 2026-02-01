-- Migration 007: Dual Currency Market (Salt + USDC)
-- Support both virtual (Salt) and real (USDC) currency listings

-- Add currency column to market_listings
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'salt';

-- Add escrow tracking for USDC listings
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS escrow_status TEXT;
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS usdc_amount REAL;

-- Add index for currency filtering
CREATE INDEX IF NOT EXISTS idx_market_listings_currency ON market_listings(currency);

-- Verify
SELECT 'Migration 007 complete ✅ — Dual currency support enabled' AS status;
