import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (chainId: ${network.chainId})`);

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.log("\n❌ Wallet has no ETH! Cannot deploy.");
    console.log("\nFund this address with Base Sepolia ETH:");
    console.log(`  ${deployer.address}`);
    console.log("\nFaucets:");
    console.log("  - https://www.alchemy.com/faucets/base-sepolia (requires 0.001 mainnet ETH)");
    console.log("  - https://faucet.quicknode.com/base/sepolia");
    console.log("  - https://learnweb3.io/faucets/base_sepolia/");
    console.log("  - https://faucets.chain.link/base-sepolia");
    console.log("\nOnce funded, run: npx hardhat run scripts/fundAndDeploy.ts --network baseSepolia");
    process.exit(1);
  }

  console.log("\n✅ Wallet funded! Proceeding with deployment...\n");

  // USDC addresses
  const USDC_ADDRESSES: Record<string, string> = {
    "8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // Base mainnet
    "84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia (circle test USDC)
  };

  const chainId = network.chainId.toString();
  const usdcAddress = USDC_ADDRESSES[chainId];
  if (!usdcAddress) {
    throw new Error(`No USDC address configured for chain ${chainId}`);
  }

  console.log(`Using USDC at: ${usdcAddress}`);

  const SaltyEscrow = await ethers.getContractFactory("SaltyEscrow");
  const escrow = await SaltyEscrow.deploy(usdcAddress);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log(`\n🎉 SaltyEscrow deployed to: ${address}`);

  // Write to deployment status
  const statusPath = path.resolve(__dirname, "../DEPLOYMENT_STATUS.md");
  const timestamp = new Date().toISOString();
  
  const statusContent = `# SaltyEscrow Deployment Status

## ✅ Deployed Successfully!

### Contract Details
- **Contract Address:** \`${address}\`
- **Network:** Base Sepolia (chainId: 84532)
- **USDC Address:** \`${usdcAddress}\`
- **Deployed At:** ${timestamp}
- **Deployer:** \`${deployer.address}\`

### Verification
View on BaseScan: https://sepolia.basescan.org/address/${address}

### Verify Contract Source (optional)
\`\`\`bash
cd /Users/potato/clawd/projects/saltdig/contracts
npx hardhat verify --network baseSepolia ${address} ${usdcAddress}
\`\`\`

### Integration
Add to your \`.env.local\`:
\`\`\`
ESCROW_CONTRACT_ADDRESS=${address}
\`\`\`

## Contract Interface

\`\`\`solidity
// Create a bounty (poster locks USDC)
function createBounty(string bountyId, uint256 amount, uint256 deadline) external

// Claim a bounty (worker stakes 10%)
function claimBounty(bytes32 hash) external

// Submit completed work
function submitBounty(bytes32 hash) external

// Approve and release funds
function approveBounty(bytes32 hash) external

// Auto-release after 72h
function autoRelease(bytes32 hash) external

// Dispute handling
function disputeBounty(bytes32 hash) external
function resolveDispute(bytes32 hash, bool favorWorker) external onlyOwner
\`\`\`

---
Last Updated: ${timestamp}
`;

  fs.writeFileSync(statusPath, statusContent);
  console.log(`Deployment status saved to DEPLOYMENT_STATUS.md`);

  // Also save to saltdig root .env.local
  const envPath = path.resolve(__dirname, "../../.env.local");
  const envLine = `ESCROW_CONTRACT_ADDRESS=${address}\n`;

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    if (content.includes("ESCROW_CONTRACT_ADDRESS=")) {
      const updated = content.replace(/ESCROW_CONTRACT_ADDRESS=.*/g, `ESCROW_CONTRACT_ADDRESS=${address}`);
      fs.writeFileSync(envPath, updated);
    } else {
      fs.appendFileSync(envPath, envLine);
    }
  } else {
    fs.writeFileSync(envPath, envLine);
  }
  console.log(`Contract address saved to .env.local`);

  console.log("\n📋 Next steps:");
  console.log("1. Verify contract on BaseScan (command above)");
  console.log("2. Update GID graph with deployment node");
  console.log("3. Test the contract with some test transactions");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
