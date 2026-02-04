# SaltyEscrow Deployment Status

## ⏳ Status: Ready for Deployment (Pending Funding)

### Deployment Checklist
- [x] Contract code: `contracts/SaltyEscrow.sol`
- [x] Hardhat configuration: Base Sepolia network configured
- [x] Deploy script: `scripts/fundAndDeploy.ts`
- [x] Deployer wallet generated
- [ ] **Wallet funded with testnet ETH** ← NEEDED

---

## Deployer Wallet

| Property | Value |
|----------|-------|
| Address | `0x799F63EAE197c4315db7a0E902C0E1e92e3210FB` |
| Network | Base Sepolia (chainId: 84532) |
| Balance | **0 ETH** (needs funding) |
| Private Key | Stored in `contracts/.env` |

---

## 🔑 Step 1: Fund the Wallet

The deployer wallet needs ~0.01 ETH to cover gas for deployment and verification.

### Faucet Options

1. **LearnWeb3 Faucet** (easiest, no requirements)
   - URL: https://learnweb3.io/faucets/base_sepolia/
   - Drip: 0.01 ETH
   - Just paste the address and claim

2. **QuickNode Faucet** (12h cooldown)
   - URL: https://faucet.quicknode.com/base/sepolia
   - Drip: 0.01 ETH

3. **Chainlink Faucet** (requires GitHub)
   - URL: https://faucets.chain.link/base-sepolia
   - Drip: 0.1 ETH

4. **Alchemy Faucet** (requires 0.001 mainnet ETH)
   - URL: https://www.alchemy.com/faucets/base-sepolia
   - Drip: 0.1 ETH

**Address to fund:** `0x799F63EAE197c4315db7a0E902C0E1e92e3210FB`

---

## 🚀 Step 2: Deploy

Once the wallet has ETH:

```bash
cd /Users/potato/clawd/projects/saltdig/contracts
npx hardhat run scripts/fundAndDeploy.ts --network baseSepolia
```

Expected output:
```
Network: base-sepolia (chainId: 84532)
Deployer: 0x799F63EAE197c4315db7a0E902C0E1e92e3210FB
Balance: 0.01 ETH

✅ Wallet funded! Proceeding with deployment...

Using USDC at: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

🎉 SaltyEscrow deployed to: 0x...
```

---

## ✅ Step 3: Verify on BaseScan

After deployment, verify the contract source code:

```bash
npx hardhat verify --network baseSepolia <DEPLOYED_ADDRESS> 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

---

## Contract Details

### SaltyEscrow.sol

A non-custodial escrow contract for USDC bounties on Base L2.

**Key Features:**
- 5% platform fee on successful bounties
- 10% worker stake requirement
- 72-hour auto-release after submission
- Dispute resolution by admin
- 1% cancellation fee for open bounties

**Target USDC (Base Sepolia):** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### Gas Estimates

| Operation | Est. Gas | Est. Cost (Base Sepolia) |
|-----------|----------|--------------------------|
| Deploy | ~2,500,000 | < $0.01 |
| createBounty | ~120,000 | < $0.001 |
| claimBounty | ~80,000 | < $0.001 |
| approveBounty | ~90,000 | < $0.001 |

---

## Quick Commands

```bash
# Check wallet balance
npx hardhat run scripts/checkBalance.ts --network baseSepolia

# Deploy (if funded)
npx hardhat run scripts/fundAndDeploy.ts --network baseSepolia

# Verify contract
npx hardhat verify --network baseSepolia <ADDRESS> 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

---

## 🔒 Security Notes

- Private key in `contracts/.env` is **testnet only**
- Never use this wallet on mainnet
- `.env` is gitignored
- For production, use hardware wallet or multisig

---

**Last Updated:** 2026-02-04T04:50:00Z
**Status:** Awaiting testnet ETH funding
