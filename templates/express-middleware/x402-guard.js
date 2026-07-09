import express from "express";

/**
 * X402 Tollbooth Guard Middleware
 * @param {string} priceUSD - The cost per API call (e.g., "0.10")
 * @param {string} developerWallet - The merchant's Base L2 collection address
 */
export function x402TollboothGuard(priceUSD, developerWallet) {
  return async (req, res, next) => {
    const txHash = req.headers["x-x402-tx-hash"];
    const senderAddress = req.headers["x-x402-sender-address"];

    // Step 1: Challenge the client if payment headers are missing
    if (!txHash || !senderAddress) {
      return res.status(402).json({
        error: "Payment Required",
        protocol: "x402",
        amountUSD: priceUSD,
        asset: "USDC",
        chain: "Base L2",
        recipient: developerWallet,
        instructions: "Execute a Base L2 USDC transfer split, then retry including 'x-x402-tx-hash' and 'x-x402-sender-address' headers."
      });
    }

    try {
      // Step 2: Clear transaction state against your multi-tenant validator proxy
      const PROXY_GATEWAY_URL = "https://x402-facilitator-proxy.seob5285.workers.dev/api/v1/verify-and-settle";
      
      const proxyResponse = await fetch(PROXY_GATEWAY_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-x402-tx-hash": txHash,
          "x-x402-sender-address": senderAddress
        },
        body: JSON.stringify({ 
          txHash, 
          expectedAmount: priceUSD, 
          developerWallet 
        })
      });

      const verification = await proxyResponse.json();

      // Step 3: If your proxy confirms the 1% split was successful, allow access!
      if (proxyResponse.status === 200 && verification.success) {
        return next();
      }

      return res.status(402).json({ 
        error: "X402 Verification Failed", 
        details: verification.message || "Invalid split signature allocation." 
      });

    } catch (err) {
      return res.status(502).json({ error: "Upstream Facilitator Gateway Timeout" });
    }
  };
}

// ---- QUICK START TEMPLATE EXAMPLE ----
// How developers use your tiny file in their apps:
/*
const app = express();
app.use(express.json());

app.get("/api/v1/premium-data", x402TollboothGuard("0.05", "0xMerchantWalletAddressHere..."), (req, res) => {
  res.json({ success: true, data: "Uncovered machine intelligence payload safely!" });
});
*/