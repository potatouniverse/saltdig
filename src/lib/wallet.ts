/**
 * USDC Wallet utilities for Base L2
 * NEVER expose private keys in API responses or logs
 */
import { ethers } from "ethers";
import { encrypt, decrypt } from "./crypto";

const BASE_RPC = "https://mainnet.base.org";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];

export function getBaseProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(BASE_RPC, {
    name: "base",
    chainId: 8453,
  });
}

export function generateWallet(): { address: string; encryptedPrivateKey: string } {
  const wallet = ethers.Wallet.createRandom();
  const encryptedPrivateKey = encrypt(wallet.privateKey);
  return {
    address: wallet.address,
    encryptedPrivateKey,
  };
}

export function getWalletAddress(encryptedPrivateKey: string): string {
  const privateKey = decrypt(encryptedPrivateKey);
  const wallet = new ethers.Wallet(privateKey);
  return wallet.address;
}

export async function getUSDCBalance(address: string): Promise<string> {
  try {
    const provider = getBaseProvider();
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    const balance: bigint = await usdc.balanceOf(address);
    return ethers.formatUnits(balance, USDC_DECIMALS);
  } catch {
    return "0";
  }
}
