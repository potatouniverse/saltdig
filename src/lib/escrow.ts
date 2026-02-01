/**
 * USDC Escrow client — interacts with the SaltyEscrow smart contract on Base L2
 */
import { ethers } from "ethers";
import { decrypt } from "./crypto";
import { getBaseProvider } from "./wallet";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

const ESCROW_ABI = [
  "function computeHash(string calldata bountyId) public pure returns (bytes32)",
  "function createBounty(string calldata bountyId, uint256 amount, uint256 deadline) external",
  "function claimBounty(bytes32 hash) external",
  "function submitBounty(bytes32 hash) external",
  "function approveBounty(bytes32 hash) external",
  "function disputeBounty(bytes32 hash) external",
  "function resolveDispute(bytes32 hash, bool favorWorker) external",
  "function cancelBounty(bytes32 hash) external",
  "function autoRelease(bytes32 hash) external",
  "function updatePlatformFee(uint256 newFeeBps) external",
  "function withdrawFees() external",
  "function bounties(bytes32) view returns (address poster, address worker, uint256 amount, uint256 workerStake, uint256 deadline, uint256 submittedAt, uint8 status, string bountyId)",
  "function platformFeeBps() view returns (uint256)",
  "function workerStakeBps() view returns (uint256)",
  "function autoReleaseSeconds() view returns (uint256)",
  "function accumulatedFees() view returns (uint256)",
  "event BountyCreated(bytes32 indexed hash, string bountyId, address poster, uint256 amount)",
  "event BountyApproved(bytes32 indexed hash, uint256 workerPayout, uint256 platformFee)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

export enum BountyStatus {
  Open = 0,
  Claimed = 1,
  Submitted = 2,
  Approved = 3,
  Disputed = 4,
  Cancelled = 5,
  AutoReleased = 6,
}

export const BountyStatusLabels = ["open", "claimed", "submitted", "approved", "disputed", "cancelled", "auto_released"] as const;

export interface OnChainBounty {
  poster: string;
  worker: string;
  amount: string; // formatted USDC
  workerStake: string;
  deadline: number;
  submittedAt: number;
  status: BountyStatus;
  statusLabel: string;
  bountyId: string;
}

function getEscrowAddress(): string {
  const addr = process.env.ESCROW_CONTRACT_ADDRESS;
  if (!addr) throw new Error("ESCROW_CONTRACT_ADDRESS not configured");
  return addr;
}

function getReadonlyContract(): ethers.Contract {
  return new ethers.Contract(getEscrowAddress(), ESCROW_ABI, getBaseProvider());
}

function getSignerFromEncryptedKey(encryptedKey: string): ethers.Wallet {
  const privateKey = decrypt(encryptedKey);
  return new ethers.Wallet(privateKey, getBaseProvider());
}

function getSignedContract(encryptedKey: string): ethers.Contract {
  const signer = getSignerFromEncryptedKey(encryptedKey);
  return new ethers.Contract(getEscrowAddress(), ESCROW_ABI, signer);
}

function getUsdcContract(signer: ethers.Wallet): ethers.Contract {
  return new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
}

export function computeBountyHash(bountyId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(bountyId));
}

async function ensureUsdcApproval(signer: ethers.Wallet, amount: bigint): Promise<void> {
  const usdc = getUsdcContract(signer);
  const escrowAddr = getEscrowAddress();
  const current: bigint = await usdc.allowance(signer.address, escrowAddr);
  if (current < amount) {
    const tx = await usdc.approve(escrowAddr, ethers.MaxUint256);
    await tx.wait();
  }
}

export class EscrowClient {
  // --- Read-only ---

  async getBounty(bountyHash: string): Promise<OnChainBounty> {
    const contract = getReadonlyContract();
    const b = await contract.bounties(bountyHash);
    return {
      poster: b.poster,
      worker: b.worker,
      amount: ethers.formatUnits(b.amount, USDC_DECIMALS),
      workerStake: ethers.formatUnits(b.workerStake, USDC_DECIMALS),
      deadline: Number(b.deadline),
      submittedAt: Number(b.submittedAt),
      status: Number(b.status) as BountyStatus,
      statusLabel: BountyStatusLabels[Number(b.status)] || "unknown",
      bountyId: b.bountyId,
    };
  }

  async getBountyStatus(bountyHash: string): Promise<{ status: BountyStatus; label: string }> {
    const bounty = await this.getBounty(bountyHash);
    return { status: bounty.status, label: bounty.statusLabel };
  }

  // --- Write (needs agent wallet) ---

  async createBounty(agentEncryptedKey: string, bountyId: string, amount: number, deadline: number): Promise<string> {
    const signer = getSignerFromEncryptedKey(agentEncryptedKey);
    const amountWei = ethers.parseUnits(amount.toString(), USDC_DECIMALS);

    await ensureUsdcApproval(signer, amountWei);

    const contract = new ethers.Contract(getEscrowAddress(), ESCROW_ABI, signer);
    const tx = await contract.createBounty(bountyId, amountWei, deadline);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async claimBounty(agentEncryptedKey: string, bountyHash: string): Promise<string> {
    const signer = getSignerFromEncryptedKey(agentEncryptedKey);
    const contract = getReadonlyContract();

    // Calculate stake needed
    const b = await contract.bounties(bountyHash);
    const stakeBps: bigint = await contract.workerStakeBps();
    const stakeAmount = (b.amount * stakeBps) / BigInt(10000);

    await ensureUsdcApproval(signer, stakeAmount);

    const signed = new ethers.Contract(getEscrowAddress(), ESCROW_ABI, signer);
    const tx = await signed.claimBounty(bountyHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async submitBounty(agentEncryptedKey: string, bountyHash: string): Promise<string> {
    const contract = getSignedContract(agentEncryptedKey);
    const tx = await contract.submitBounty(bountyHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async approveBounty(agentEncryptedKey: string, bountyHash: string): Promise<string> {
    const contract = getSignedContract(agentEncryptedKey);
    const tx = await contract.approveBounty(bountyHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async disputeBounty(agentEncryptedKey: string, bountyHash: string): Promise<string> {
    const contract = getSignedContract(agentEncryptedKey);
    const tx = await contract.disputeBounty(bountyHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async cancelBounty(agentEncryptedKey: string, bountyHash: string): Promise<string> {
    const contract = getSignedContract(agentEncryptedKey);
    const tx = await contract.cancelBounty(bountyHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async autoRelease(bountyHash: string): Promise<string> {
    // Public call — use platform wallet or any funded wallet
    const platformKey = process.env.PLATFORM_WALLET_KEY;
    if (!platformKey) throw new Error("PLATFORM_WALLET_KEY not configured");
    const contract = getSignedContract(platformKey);
    const tx = await contract.autoRelease(bountyHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }
}

export const escrowClient = new EscrowClient();
