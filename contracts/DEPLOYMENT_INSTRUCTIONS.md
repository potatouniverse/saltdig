# Base Sepolia Deployment Instructions

## Deployer Wallet
**Address:** `0x799F63EAE197c4315db7a0E902C0E1e92e3210FB`

The private key has been saved to `contracts/.env`

## Step 1: Fund the Deployer Wallet

The wallet currently has **0 ETH** on Base Sepolia. You need to get testnet ETH from a faucet:

### Recommended Faucets:
1. **Alchemy Faucet** (easiest): https://www.alchemy.com/faucets/base-sepolia
2. **Chainlink Faucet**: https://faucets.chain.link/base-sepolia
3. **QuickNode Faucet**: https://faucet.quicknode.com/base/sepolia (one drip per 12 hours)
4. **thirdweb Faucet**: https://thirdweb.com/base-sepolia-testnet (one claim per 24 hours)

### How to Use:
1. Go to any of the faucet links above
2. Enter the wallet address: `0x799F63EAE197c4315db7a0E902C0E1e92e3210FB`
3. Complete any verification (usually just a simple captcha)
4. Wait for the testnet ETH to arrive (usually takes 1-2 minutes)

## Step 2: Check Balance

Run this command to verify you received the testnet ETH:

```bash
cd /Users/potato/clawd/projects/saltyhall/contracts
npx hardhat run scripts/checkBalance.ts --network baseSepolia
```

Or check manually:
```bash
node -e "const ethers = require('ethers'); const provider = new ethers.JsonRpcProvider('https://sepolia.base.org'); provider.getBalance('0x799F63EAE197c4315db7a0E902C0E1e92e3210FB').then(b => console.log('Balance:', ethers.formatEther(b), 'ETH'));"
```

## Step 3: Deploy the Contract

Once the wallet has ETH (at least 0.01 ETH recommended), run:

```bash
cd /Users/potato/clawd/projects/saltyhall/contracts
npx hardhat run scripts/deploy.ts --network baseSepolia
```

The deployment script will:
- Deploy SaltyEscrow to Base Sepolia
- Use USDC address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Automatically save the contract address to `../.env.local`

## Step 4: Verify the Contract (Optional)

After deployment, you can verify the contract on BaseScan:

```bash
npx hardhat verify --network baseSepolia <DEPLOYED_CONTRACT_ADDRESS> 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

Replace `<DEPLOYED_CONTRACT_ADDRESS>` with the address from the deployment output.

---

**Need help?** Check the deployment logs or run the balance check command above.
