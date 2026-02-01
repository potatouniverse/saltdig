import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log(`Deploying to network: ${network.name} (chainId: ${network.chainId})`);

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
  console.log(`SaltyEscrow deployed to: ${address}`);

  // Write to .env file in project root
  const envPath = path.resolve(__dirname, "../../.env.local");
  const envLine = `\nESCROW_CONTRACT_ADDRESS=${address}\n`;

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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
