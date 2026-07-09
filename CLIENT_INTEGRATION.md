# Client Integration Guide for X402 Payment Verification

This guide shows how AI agents can easily integrate with the X402 payment verification proxy to execute split payments on Base L2 and verify them—**no complex npm installations required**.

---

## Zero-Installation Integration (Copy-Paste)

To integrate your agent, simply create a helper file in your codebase (e.g., `x402Client.js` or `x402Client.ts`) and use the following lightweight native implementation with **ethers.js v6**:

```javascript
import { ethers } from "ethers";

const BASE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32d4f71b54bda02913";
const PROXY_GATEWAY_URL = "https://x402-facilitator-proxy.seob5285.workers.dev/api/v1/verify-and-settle";
const FACILITATOR_WALLET = "0x2E3DADfb314718849A93c49A78618E586c3b2C60"; // Account 3 Vault Gateway

/**
 * Executes a split payment for an AI Agent utility call and verifies it with the proxy gateway.
 * @param {ethers.Signer} agentWallet - The signer wallet executing the call
 * @param {string} developerWallet - The target recipient wallet for the service
 * @param {string} totalAmountUSD - The transaction value in fiat representation (e.g. "1.00")
 */
export async function executeAgentPayment(agentWallet, developerWallet, totalAmountUSD) {
  try {
    // Ethers v6 parses units directly off the root object (USDC uses 6 decimals)
    const totalRaw = ethers.parseUnits(totalAmountUSD, 6);
    
    // Split processing using standard JavaScript BigInt operators natively supported in v6
    const facilitatorCut = (totalRaw * 1n) / 100n; // 1% tollbooth platform fee
    const developerCut = totalRaw - facilitatorCut;

    const usdcABI = ["function transfer(address to, uint256 value) returns (bool)"];
    const usdcContract = new ethers.Contract(BASE_USDC_CONTRACT, usdcABI, agentWallet);

    console.log(`Sending developer slice (${Number(developerCut) / 1e6} USDC)...`);
    const tx1 = await usdcContract.transfer(developerWallet, developerCut);
    await tx1.wait();

    console.log(`Sending 1% platform fee slice (${Number(facilitatorCut) / 1e6} USDC)...`);
    const tx2 = await usdcContract.transfer(FACILITATOR_WALLET, facilitatorCut);
    const receipt = await tx2.wait();

    console.log("Pinging Cloudflare tollbooth verification gateway...");
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

    const verification = await response.json();
    return response.status === 200 && verification.success;

  } catch (error) {
    console.error("X402 Integration Error:", error);
    return false;
  }
}
```

## Usage Example

```typescript
import { walletSigner } from "./walletSetup";
import { executeAgentPayment } from "./x402Client";

async function runAgentTask() {
  const paymentVerified = await executeAgentPayment(
    walletSigner, 
    "0xDeveloperWalletAddress...", 
    "1.00"
  );

  if (paymentVerified) {
    console.log("🚀 Gateway verification success! Executing high-performance calculation...");
    // Trigger your tool execution logic here
  } else {
    console.log("❌ Settlement check failed or rejected.");
  }
}
```

## API Endpoint

**POST** `/api/v1/verify-and-settle`

### Request Body
```json
{
  "txHash": "0x...",
  "expectedAmount": "1.00",
  "developerWallet": "0x..."
}
```

### Response
```json
{
  "success": true,
  "message": "Payment successfully settled and logged",
  "yieldCollected": true,
  "strategiesVerified": ["B", "C"]
}
```
