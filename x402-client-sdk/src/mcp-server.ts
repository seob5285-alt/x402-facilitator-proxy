import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ethers } from "ethers";

// 1. Initialize the AI-scannable Server Instance
const server = new Server(
  { name: "x402-payment-gateway", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 2. Define the schema of the split payment operation for the LLM
const PaymentArgumentsSchema = z.object({
  privateKey: z.string().describe("The 64-character hexadecimal private key of the agent's payment wallet (prefixed with 0x)"),
  developerWallet: z.string().describe("The recipient developer's wallet address on Base L2"),
  amountUSD: z.string().describe("The total payment amount in USD representation (e.g., '1.50')")
});

// 3. Let the AI Agent discover what this tool does
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "route_x402_payment",
    description: "Executes an automatic 1% split utility payment on Base L2 and settles access verification via the X402 Cloudflare proxy.",
    inputSchema: {
      type: "object",
      properties: {
        privateKey: { type: "string" },
        developerWallet: { type: "string" },
        amountUSD: { type: "string" }
      },
      required: ["privateKey", "developerWallet", "amountUSD"]
    }
  }]
}));

// 4. Handle the actual code execution loop when the AI triggers it
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  if (request.params.name !== "route_x402_payment") {
    throw new Error("Tool not found");
  }

  try {
    const args = PaymentArgumentsSchema.parse(request.params.arguments);
    
    // Set up the provider connection directly to Base L2
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const agentWallet = new ethers.Wallet(args.privateKey, provider);

    // Re-use your core v6 verification architecture cleanly
    const BASE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32d4f71b54bda02913";
    const PROXY_GATEWAY_URL = "https://x402-facilitator-proxy.seob5285.workers.dev/api/v1/verify-and-settle";
    const FACILITATOR_WALLET = "0x2E3DADfb314718849A93c49A78618E586c3b2C60";

    const totalRaw = ethers.parseUnits(args.amountUSD, 6);
    const facilitatorCut = (totalRaw * 1n) / 100n;
    const developerCut = totalRaw - facilitatorCut;

    const usdcABI = ["function transfer(address to, uint256 value) returns (bool)"];
    const usdcContract = new ethers.Contract(BASE_USDC_CONTRACT, usdcABI, agentWallet);

    const tx1 = await usdcContract.transfer(args.developerWallet, developerCut);
    await tx1.wait();

    const tx2 = await usdcContract.transfer(FACILITATOR_WALLET, facilitatorCut);
    const receipt = await tx2.wait();

    const response = await fetch(PROXY_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-x402-tx-hash": receipt!.hash,
        "x-x402-sender-address": await agentWallet.getAddress()
      },
      body: JSON.stringify({
        txHash: receipt!.hash,
        expectedAmount: args.amountUSD,
        developerWallet: args.developerWallet
      })
    });

    const verification = await response.json() as { success: boolean; error?: string };

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: response.status === 200 && verification.success, txHash: receipt!.hash, verification })
      }]
    };

  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: `Payment Execution Failed: ${error.message}` }]
    };
  }
});

// 5. Connect to the Standard I/O pipeline transport layer
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error("Failed to connect to transport:", error);
  process.exit(1);
});