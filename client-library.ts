import { ethers, parseUnits, Contract, Interface } from "ethers";

const BASE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913";
const PROXY_GATEWAY_URL = "https://x402-facilitator-proxy.seob5285.workers.dev/api/v1/verify-and-settle";
const FACILITATOR_WALLET = "0x2E3DADfb314718849A93c49A78618E586c3b2C60"; // Account 3 Vault

export interface PaymentConfig {
  agentWallet: ethers.Signer;
  developerWallet: string;
  amountUSD: string;
}

/**
 * Direct drop-in function for third-party developers to secure monetization lanes.
 */
export async function routeUtilityPayment({ agentWallet, developerWallet, amountUSD }: PaymentConfig): Promise<boolean> {
  const totalRaw = parseUnits(amountUSD, 6);
  const facilitatorCut = (totalRaw * 1n) / 100n; // Strict 1% platform fee
  const developerCut = totalRaw - facilitatorCut; // 99% 

  const usdcABI = ["function transfer(address to, uint256 value) returns (bool)"];
  const usdcContract = new Contract(BASE_USDC_CONTRACT, usdcABI, agentWallet);

  // Send 99% to the software creator
  const tx1 = await usdcContract.transfer(developerWallet, developerCut);
  await tx1.wait();

  // Send 1% to your platform tollbooth
  const tx2 = await usdcContract.transfer(FACILITATOR_WALLET, facilitatorCut);
  const receipt = await tx2.wait();

  // Validate instantly at your Cloudflare network edge
  const response = await fetch(PROXY_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-x402-tx-hash": receipt.transactionHash,
      "x-x402-sender-address": await agentWallet.getAddress()
    },
    body: JSON.stringify({
      txHash: receipt.transactionHash,
      expectedAmount: amountUSD,
      developerWallet: developerWallet
    })
  });

  const result = await response.json() as { success: boolean; error?: string };
  return response.status === 200 && result.success;
}

// The standard EVM Multicall ABI for batching transactions
const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11"; // Official Base Multicall3 deployment
const MULTICALL_ABI = [
  "function aggregate(tuple(address target, bytes callData)[] calls) public payable returns (uint256 blockNumber, bytes[] returnData)"
];

export async function executeAtomicSplit(agentWallet: ethers.Signer, developerWallet: string, totalAmountUSD: string): Promise<string> {
  const totalRaw = parseUnits(totalAmountUSD, 6);
  const facilitatorCut = (totalRaw * 1n) / 100n;
  const developerCut = totalRaw - facilitatorCut;

  const usdcInterface = new Interface([
    "function transfer(address to, uint256 value) returns (bool)"
  ]);

  // Encode both transfer actions into low-level bytes data
  const devCallData = usdcInterface.encodeFunctionData("transfer", [developerWallet, developerCut]);
  const platformCallData = usdcInterface.encodeFunctionData("transfer", [FACILITATOR_WALLET, facilitatorCut]);

  const multicallContract = new Contract(MULTICALL_ADDRESS, MULTICALL_ABI, agentWallet);

  console.log("Compacting financial execution down to a single atomic L2 transaction...");

  // Batch execute both payments in one atomic block
  const tx = await multicallContract.aggregate([
    { target: BASE_USDC_CONTRACT, callData: devCallData },
    { target: BASE_USDC_CONTRACT, callData: platformCallData }
  ]);
  
  const receipt = await tx.wait();
  
  // Validate the atomic transaction
  const response = await fetch(PROXY_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-x402-tx-hash": receipt.transactionHash,
      "x-x402-sender-address": await agentWallet.getAddress()
    },
    body: JSON.stringify({
      txHash: receipt.transactionHash,
      expectedAmount: totalAmountUSD,
      developerWallet: developerWallet
    })
  });

  const result = await response.json() as { success: boolean; error?: string };
  if (response.status !== 200 || !result.success) {
    throw new Error(`Gateway authentication failed: ${result.error}`);
  }

  return receipt.transactionHash;
}
