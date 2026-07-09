import { Hono } from "hono";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import type { KVNamespace } from "@cloudflare/workers-types";

type Env = {
  X402_NONCES: KVNamespace; // Global edge memory tracking consumed hashes
  COMPLIANCE_KV: KVNamespace; // Sanction/compliance blocklist
};

const app = new Hono<{ Bindings: Env }>();

// RPC endpoints with automatic failover
const RPC_ENDPOINTS = [
  "https://mainnet.base.org",
  "https://base-rpc.publicnode.com",
  "https://1rpc.io/base"
];

// RPC response type definition
interface RpcResponse {
  result?: any;
  error?: any;
  id?: number;
  jsonrpc?: string;
}

// Helper function to query the blockchain with automatic failover
async function fetchWithRetry(payload: any): Promise<RpcResponse> {
  for (const url of RPC_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(1500) // 1.5 second timeout per node
      });
      if (response.ok) return await response.json();
    } catch (e) {
      console.warn(`RPC Node ${url} failed, trying next provider...`);
    }
  }
  throw new Error("All RPC endpoints are currently exhausted.");
}

// STRATEGY C: Platform wallet address (Account 3 vault)
const MY_PLATFORM_WALLET = "0x2E3DADfb314718849A93c49A78618E586c3b2C60".toLowerCase();

// STRATEGY B: Strict Base USDC Contract Address
const BASE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913".toLowerCase();

// Minimal ERC-20 ABI to parse transfer logs (USDC)
const erc20Abi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
] as const;

// The Facilitator endpoint developers call to check if an agent actually paid them
app.post("/api/v1/verify-and-settle", async (c) => {
  const body = await c.req.json();
  const { txHash, expectedAmount, developerWallet } = body;
  const senderAddress = c.req.header('x-x402-sender-address');

  if (!txHash || !expectedAmount || !developerWallet) {
    return c.json({ error: "Missing verification parameters" }, 400);
  }

  try {
    // 0. COMPLIANCE CHECK: Sanction screening
    if (senderAddress) {
      const isSanctioned = await c.env.COMPLIANCE_KV.get(senderAddress.toLowerCase());
      if (isSanctioned) {
        return c.text("Forbidden: Transaction origin risk tier too high.", 403);
      }
    }

    // 1. FAST PATH: Check if this transaction has already been spent
    const isReplay = await c.env.X402_NONCES.get(`tx:${txHash}`);
    if (isReplay) {
      return c.json({ success: false, error: "Transaction already processed (Replay attack blocked)" }, 401);
    }

    // 2. BLOCKCHAIN LOOKUP: Fetch transaction receipt with RPC failover
    const receipt = await fetchWithRetry({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash]
    });

    if (!receipt || !receipt.result) {
      return c.json({ error: "Transaction not found or unconfirmed." }, 404);
    }

    // 3. ENHANCED VERIFICATION: Strategy B & C
    let isValidPlatformCut = false;
    let developerGotPaid = false;

    for (const log of receipt.result.logs) {
      const contractAddress = log.address.toLowerCase();
      
      // STRATEGY B CHECK: Is this token actually verified Base USDC?
      if (contractAddress === BASE_USDC_CONTRACT) {
        // Parse out the "to" address from the standard ERC-20 Transfer log topic
        // Topic[2] contains the indexed receiving wallet address (padded to 32 bytes)
        if (log.topics && log.topics[2]) {
          const receiverInLog = "0x" + log.topics[2].slice(26).toLowerCase();
          
          // STRATEGY C CHECK: Verify the 1% platform cut recipient
          if (receiverInLog === MY_PLATFORM_WALLET) {
            isValidPlatformCut = true;
          }
          
          // Check if developer received their 99% cut
          if (receiverInLog === developerWallet.toLowerCase()) {
            developerGotPaid = true;
          }
        }
      }
    }

    if (!isValidPlatformCut) {
      return c.json({ error: "Security Halt: Invalid token type or incorrect platform yield routing." }, 400);
    }

    if (!developerGotPaid) {
      return c.json({ error: "Developer target wallet did not receive payment logs" }, 400);
    }

    // 4. LOCK ENTRY AT THE EDGE: Save hash to global cache for 24 hours so it can't be re-sent
    await c.env.X402_NONCES.put(`tx:${txHash}`, "consumed", { expirationTtl: 86400 });

    return c.json({
      success: true,
      message: "Payment successfully settled and logged",
      yieldCollected: true,
      strategiesVerified: ["B", "C"]
    });

  } catch (error: any) {
    return c.json({ success: false, error: error.message || "Internal validation error" }, 500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log("Cron trigger started: Syncing risk wallets...");
    
    try {
      const SEC_FEED_URL = "https://raw.githubusercontent.com/cosm辐射/public-threat-intel/main/sanctioned_addresses.json";
      
      const response = await fetch(SEC_FEED_URL);
      if (!response.ok) throw new Error("Failed to fetch threat intelligence feed.");
      
      const blacklistedWallets: string[] = await response.json();
      
      for (const wallet of blacklistedWallets) {
        await env.COMPLIANCE_KV.put(wallet.toLowerCase(), "sanctioned", {
          expirationTtl: 172800
        });
      }
      
      console.log(`Successfully auto-sync'd ${blacklistedWallets.length} high-risk addresses.`);
    } catch (error) {
      console.error("Compliance Sync Error:", error);
    }
  }
};
