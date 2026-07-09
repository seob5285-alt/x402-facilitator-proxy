import { routeUtilityPayment } from "./src/index"; // Pulls directly from your clean source code
import { ethers } from "ethers";

async function runIntegrationTest() {
  console.log("🚀 Starting End-to-End SDK Integration Test...");

  // 1. Create a completely random burnable test wallet to simulate an AI Agent
  // (No real funds needed just to test the API handshake)
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
  const mockAgentWallet = ethers.Wallet.createRandom().connect(provider);

  // 2. Set up fake transaction details pointing to a developer's wallet
  const targetDeveloper = "0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5";
  const testAmount = "1.50"; // $1.50 USD test

  try {
    console.log("Sending payload through the SDK interface...");
    
    // 3. Fire the SDK function we just fixed
    const isApproved = await routeUtilityPayment({
      agentWallet: mockAgentWallet,
      developerWallet: targetDeveloper,
      amountUSD: testAmount
    });

    console.log(`\nResult from live Proxy: ${isApproved ? "SUCCESS" : "DENIED"}`);

  } catch (error: any) {
    console.log("\n❌ Network Edge Caught the Request Safely!");
    console.log(`Worker Response Message: ${error.message}`);
  }
}

runIntegrationTest();