import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  
  console.log("Deployer address:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  
  if (balance === 0n) {
    console.log("\n⚠️  Wallet has no ETH! Please fund it using a faucet.");
    console.log("See DEPLOYMENT_INSTRUCTIONS.md for faucet links.");
  } else {
    console.log("\n✅ Wallet is funded and ready to deploy!");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
