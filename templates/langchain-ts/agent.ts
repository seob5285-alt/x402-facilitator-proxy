import { DynamicTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ethers } from "ethers";
import { z } from "zod";

const PaymentSchema = z.object({
  agentPrivateKey: z.string().describe("The 64-character hex private key of the agent wallet (with 0x prefix)"),
  developerWallet: z.string().describe("The target developer's Base L2 recipient wallet address"),
  amountUSD: z.string().describe("The execution cost target in fiat representation (e.g., '1.50')")
});

// Type for proxy gateway response
interface ProxyGatewayResponse {
  success: boolean;
  message?: string;
  error?: string;
}

const routeX402Payment = new DynamicTool({
  name: "route_x402_payment",
  description: "Executes an automated multi-tenant utility split payment on Base L2 network (routing 1% facilitator fee) and settles access validation.",
  func: async (input: string) => {
    try {
      // Parse and validate input
      let parsedInput;
      try {
        parsedInput = JSON.parse(input);
      } catch (parseError) {
        return `Invalid JSON input: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`;
      }

      const { agentPrivateKey, developerWallet, amountUSD } = parsedInput;
      
      // Validate input with Zod schema
      let validatedInput;
      try {
        validatedInput = PaymentSchema.parse({ agentPrivateKey, developerWallet, amountUSD });
      } catch (validationError) {
        return `Validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`;
      }
      
      // Validate private key format
      if (!validatedInput.agentPrivateKey.match(/^0x[a-fA-F0-9]{64}$/)) {
        return `Invalid private key format. Expected 64-character hex string with 0x prefix.`;
      }

      // Validate wallet address format
      if (!ethers.isAddress(validatedInput.developerWallet)) {
        return `Invalid developer wallet address format.`;
      }

      // Validate amount
      const amountNum = parseFloat(validatedInput.amountUSD);
      if (isNaN(amountNum) || amountNum <= 0) {
        return `Invalid amount: must be a positive number.`;
      }

      const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
      const wallet = new ethers.Wallet(validatedInput.agentPrivateKey, provider);

      const BASE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32d4f71b54bda02913";
      const PROXY_GATEWAY_URL = "https://x402-facilitator-proxy.seob5285.workers.dev/api/v1/verify-and-settle";
      const FACILITATOR_WALLET = "0x2E3DADfb314718849A93c49A78618E586c3b2C60"; // Your platform vault cash register

      const totalRaw = ethers.parseUnits(validatedInput.amountUSD, 6);
      const facilitatorCut = (totalRaw * 1n) / 100n; // Programmatic 1% slice
      const developerCut = totalRaw - facilitatorCut;

      // Check if amounts are reasonable (not zero)
      if (developerCut <= 0n || facilitatorCut <= 0n) {
        return `Amount too small to process meaningful payment splits.`;
      }

      const usdcABI = [
        "function transfer(address to, uint256 value) returns (bool)",
        "function balanceOf(address account) returns (uint256)"
      ];
      const usdcContract = new ethers.Contract(BASE_USDC_CONTRACT, usdcABI, wallet);

      // Check balance before attempting transfers
      const balance = await usdcContract.balanceOf(await wallet.getAddress());
      if (balance < totalRaw) {
        return `Insufficient USDC balance. Required: ${ethers.formatUnits(totalRaw, 6)} USDC, Available: ${ethers.formatUnits(balance, 6)} USDC`;
      }

      // Execute transfers
      const tx1 = await usdcContract.transfer(validatedInput.developerWallet, developerCut);
      const receipt1 = await tx1.wait();
      if (!receipt1 || receipt1.status !== 1) {
        return `Developer payment transaction failed: ${receipt1?.hash || 'unknown'}`;
      }

      const tx2 = await usdcContract.transfer(FACILITATOR_WALLET, facilitatorCut);
      const receipt2 = await tx2.wait();
      if (!receipt2 || receipt2.status !== 1) {
        return `Facilitator payment transaction failed: ${receipt2?.hash || 'unknown'}`;
      }

      // Verify with proxy gateway
      const response = await fetch(PROXY_GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-x402-tx-hash": receipt2.hash,
          "x-x402-sender-address": await wallet.getAddress()
        },
        body: JSON.stringify({
          txHash: receipt2.hash,
          expectedAmount: validatedInput.amountUSD,
          developerWallet: validatedInput.developerWallet
        })
      });

      if (!response.ok) {
        return `Proxy gateway request failed: ${response.status} ${response.statusText}`;
      }

      const verification = await response.json() as ProxyGatewayResponse;
      if (verification.success) {
        return `Payment Succeeded. Developer tx: ${receipt1.hash}, Facilitator tx: ${receipt2.hash}. Access verified by proxy gateway.`;
      }
      return `Payment executed but proxy clearance failed: ${JSON.stringify(verification)}`;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return `Payment execution process failed: ${errorMessage}`;
    }
  }
});

const model = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 });

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a payment processing agent that helps route X402 payments on Base L2 network. You can execute payments by splitting fees between developers and facilitators."],
  ["placeholder", "{chat_history}"],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
]);

export async function createPaymentAgent() {
  const agent = await createToolCallingAgent({
    llm: model,
    tools: [routeX402Payment],
    prompt,
  });

  return new AgentExecutor({
    agent,
    tools: [routeX402Payment],
    verbose: true,
  });
}

// For immediate use, you can create the agent like this:
// const paymentAgent = await createPaymentAgent();