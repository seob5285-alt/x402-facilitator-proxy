import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// 1. Setup Network Client and Hot Gateway Account
const baseClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

// Load the Account 3 Private Key securely from environment variables
const HOT_WALLET_PRIVATE_KEY = process.env.HOT_WALLET_PRIVATE_KEY as `0x${string}`;
if (!HOT_WALLET_PRIVATE_KEY) {
  throw new Error("Missing HOT_WALLET_PRIVATE_KEY in environment configuration.");
}

const hotWalletAccount = privateKeyToAccount(HOT_WALLET_PRIVATE_KEY);
const walletClient = createWalletClient({
  account: hotWalletAccount,
  chain: base,
  transport: http("https://mainnet.base.org"),
});

// 2. Constants Configuration
const USDC_BASE_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const;
const SAFE_VAULT_ADDRESS = "0x49472462b246B83ab0Cc26862a0A9f7cA35B1b0c" as const;

// Example blacklist registry address (replace with actual contract address)
const BLACKLIST_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// Minimal ERC-20 ABI for balance checking and transfers
const erc20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "success", type: "boolean" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Blacklist Registry ABI (example - adjust based on actual contract)
const blacklistRegistryAbi = [
  {
    inputs: [],
    name: "getBlacklistedAddresses",
    outputs: [{ name: "addresses", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "isBlacklisted",
    outputs: [{ name: "blacklisted", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// 3. The Automation Execution Function
export async function executeVaultSweep() {
  console.log("🔄 Starting autonomous capital sweep from Hot Wallet to Safe Vault...");

  try {
    // Read blacklist from on-chain registry (skip if using zero address placeholder)
    if (BLACKLIST_REGISTRY_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      console.log("🔍 Checking blacklist registry...");
      const blacklistedAddresses = await baseClient.readContract({
        address: BLACKLIST_REGISTRY_ADDRESS,
        abi: blacklistRegistryAbi,
        functionName: "getBlacklistedAddresses",
      }) as `0x${string}`[];

      console.log(`📋 Found ${blacklistedAddresses.length} blacklisted addresses`);

      // Check if our vault is blacklisted
      const isVaultBlacklisted = await baseClient.readContract({
        address: BLACKLIST_REGISTRY_ADDRESS,
        abi: blacklistRegistryAbi,
        functionName: "isBlacklisted",
        args: [SAFE_VAULT_ADDRESS],
      }) as boolean;

      if (isVaultBlacklisted) {
        console.error("❌ Safe Vault address is blacklisted! Aborting sweep.");
        return;
      }
    } else {
      console.log("⚠️ Blacklist registry not configured (using zero address). Skipping blacklist check.");
    }

    // Check current stablecoin balance of Account 3 (USDC has 6 decimals)
    const currentBalance = await baseClient.readContract({
      address: USDC_BASE_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [hotWalletAccount.address],
    }) as bigint;

    // Set a sweeping threshold (500 USDC as specified)
    const threshold = parseUnits("500", 6);

    if (currentBalance < threshold) {
      console.log(`ℹ️ Balance ($${Number(currentBalance) / 1e6}) below sweep threshold of $500. Skipping execution.`);
      return;
    }

    console.log(`💸 Threshold met! Sweeping ${Number(currentBalance) / 1e6} USDC to Safe Vault...`);

    // Execute the transfer directly to Multi-Sig Safe
    const txHash = await walletClient.writeContract({
      address: USDC_BASE_ADDRESS,
      abi: erc20Abi,
      functionName: "transfer",
      args: [SAFE_VAULT_ADDRESS, currentBalance],
    });

    console.log(`✅ Vault Sweep Complete! Transaction Hash: ${txHash}`);
    
    // Optional: Hook up a Discord/Telegram Webhook post here to notify you.

  } catch (error) {
    console.error("❌ Critical Error executing autonomous vault sweep:", error);
  }
}

// Execute the function when run directly
executeVaultSweep().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});