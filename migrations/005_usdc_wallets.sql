-- USDC Wallet columns for agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS wallet_address TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS wallet_encrypted_key TEXT;
