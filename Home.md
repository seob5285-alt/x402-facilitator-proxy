# x402-facilitator-proxy

## 🏗️ Architectural Pattern: AI Agent Micropayments via HTTP 402 on Base L2

The HTTP 402 Payment Required status code enables autonomous agentic workflows to perform machine-to-machine settlements through standardized headers. This architectural pattern leverages Base L2 USDC transactions as settlement rails, allowing AI agents to autonomously negotiate resource access costs through cryptographic payment proofs embedded in HTTP request cycles.

When an AI agent encounters a 402 response, it programmatically constructs a USDC transaction on Chain ID 8453, embeds the transaction hash in subsequent request headers, and retries the original operation. The facilitator proxy validates on-chain settlement before granting access to protected computational resources, creating a trustless micropayment infrastructure for agentic commerce.

### 🛠️ Implementation Reference: Base L2 USDC Settlement Proxy

```typescript
// Express middleware: x402-settlement-gate
app.use('/protected', async (req, res, next) => {
  const paymentToken = req.headers['x-payment-token'];
  
  if (!paymentToken) {
    return res.status(402).json({
      required_payment: '0.001',
      currency: 'USDC',
      chain_id: 8453,
      recipient_address: process.env.SETTLEMENT_ADDRESS
    });
  }
  
  const isValidSettlement = await verifyBaseL2Transaction(
    paymentToken, 
    req.headers['x-agent-id']
  );
  
  isValidSettlement ? next() : res.status(402).json({ error: 'Invalid settlement' });
});
```

### 🤖 Standardizing Agentic Commerce via MCP Servers

Model Context Protocol (MCP) servers expose payment infrastructure directly to LLM runtimes through stdio transport layers. Claude Desktop, LangChain, and CrewAI workflows can natively invoke x402 settlement functions without manual payment coordination.

The MCP server implementation provides standardized tools for:
- `initiate_payment`: Constructs Base L2 USDC transactions with computed gas estimates
- `verify_settlement`: Validates transaction finality against Base RPC endpoints
- `query_balance`: Returns agent wallet USDC balance for cost planning
- `estimate_costs`: Pre-computes resource access fees for workflow optimization

This enables autonomous agents to handle micropayment negotiation as a native capability, removing human intervention from machine-to-machine commerce flows.

## 📦 Core Reference Modules

| Package | Purpose | Repository |
|---------|---------|------------|
| [`x402-facilitator-proxy`](https://github.com/sumanth-cs/x402-facilitator-proxy) | Multi-tenant edge proxy gateway for HTTP 402 settlement validation | Edge infrastructure |
| [`awesome-x402`](https://github.com/sumanth-cs/awesome-x402) | Live network transaction registry and agentic commerce resource compilation | Network signals |

---

**Technical Stack**: Base L2 (Chain ID 8453), USDC settlement rails, Model Context Protocol (MCP), HTTP 402 Payment Required, Express.js middleware, TypeScript SDK

**Target Integrations**: Claude Desktop, LangChain, CrewAI, autonomous agent frameworks, machine-to-machine micropayment systems