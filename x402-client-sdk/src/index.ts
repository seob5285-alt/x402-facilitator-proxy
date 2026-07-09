import { ethers, Contract } from "ethers";

const BASE_USDC_CONTRACT = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const PROXY_GATEWAY_URL = "https://x402-facilitator-proxy.seob5285.workers.dev/api/v1/verify-and-settle";
const FACILITATOR_WALLET = "0x2E3DADfb314718849A93c49A78618E586c3b2C60";

export interface PaymentConfig {
  agentWallet: ethers.Signer;
  developerWallet: string;
  amountUSD: string;
}

export async function routeUtilityPayment({ agentWallet, developerWallet, amountUSD }: PaymentConfig): Promise<boolean> {
  const totalRaw = ethers.parseUnits(amountUSD, 6);
  const facilitatorCut = totalRaw * BigInt(1) / BigInt(100);
  const developerCut = totalRaw - facilitatorCut;

  const usdcABI = ["function transfer(address to, uint256 value) returns (bool)"];
  const usdcContract = new Contract(BASE_USDC_CONTRACT, usdcABI, agentWallet);

  const tx1 = await usdcContract.transfer(developerWallet, developerCut);
  await tx1.wait();

  const tx2 = await usdcContract.transfer(FACILITATOR_WALLET, facilitatorCut);
  const receipt = await tx2.wait();

  const response = await fetch(PROXY_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-x402-tx-hash": receipt.hash,
      "x-x402-sender-address": await agentWallet.getAddress()
    },
    body: JSON.stringify({
      txHash: receipt.hash,
      expectedAmount: amountUSD,
      developerWallet: developerWallet
    })
  });

  const result = await response.json() as { success?: boolean; error?: string };
  return response.status === 200 && result.success === true;
}

const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL_ABI = [
  "function aggregate(tuple(address target, bytes callData)[] calls) public payable returns (uint256 blockNumber, bytes[] returnData)"
];

export async function executeAtomicSplit(agentWallet: ethers.Signer, developerWallet: string, totalAmountUSD: string): Promise<string> {
  const totalRaw = ethers.parseUnits(totalAmountUSD, 6);
  const facilitatorCut = totalRaw * BigInt(1) / BigInt(100);
  const developerCut = totalRaw - facilitatorCut;

  const usdcInterface = new ethers.Interface([
    "function transfer(address to, uint256 value) returns (bool)"
  ]);

  const devCallData = usdcInterface.encodeFunctionData("transfer", [developerWallet, developerCut]);
  const platformCallData = usdcInterface.encodeFunctionData("transfer", [FACILITATOR_WALLET, facilitatorCut]);

  const multicallContract = new Contract(MULTICALL_ADDRESS, MULTICALL_ABI, agentWallet);

  const tx = await multicallContract.aggregate([
    { target: BASE_USDC_CONTRACT, callData: devCallData },
    { target: BASE_USDC_CONTRACT, callData: platformCallData }
  ]);
  
  const receipt = await tx.wait();
  
  const response = await fetch(PROXY_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-x402-tx-hash": receipt.hash,
      "x-x402-sender-address": await agentWallet.getAddress()
    },
    body: JSON.stringify({
      txHash: receipt.hash,
      expectedAmount: totalAmountUSD,
      developerWallet: developerWallet
    })
  });

  const result = await response.json() as { success: boolean; error?: string };
if (response.status !== 200 || result.success !== true) {
  throw new Error(`Gateway authentication failed: ${result.error || 'Unknown error'}`);
}

  return receipt.hash;
}
