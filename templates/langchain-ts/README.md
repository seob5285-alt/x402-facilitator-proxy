# LangChain TypeScript Payment Agent

This template provides a LangChain-based TypeScript agent for processing X402 payments on the Base L2 network.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your environment variables (create a `.env` file):
```env
OPENAI_API_KEY=your_openai_api_key_here
```

3. Usage example:
```typescript
import { createPaymentAgent } from './agent.js';

const agent = await createPaymentAgent();

const result = await agent.invoke({
  input: JSON.stringify({
    agentPrivateKey: "0x1234567890abcdef...", // 64-character hex private key
    developerWallet: "0x742d35Cc6297C24aE0E4838C4667C02693C4cB36",
    amountUSD: "10.50"
  })
});

console.log(result);
```

## Features

- **Input Validation**: Comprehensive validation of private keys, wallet addresses, and amounts
- **Balance Checking**: Verifies sufficient USDC balance before attempting transfers
- **Error Handling**: Detailed error messages for debugging
- **Transaction Verification**: Confirms successful transaction execution
- **Proxy Gateway Integration**: Validates payments through the X402 facilitator proxy

## Dependencies

- `@langchain/core`: Core LangChain functionality
- `@langchain/openai`: OpenAI integration for LangChain
- `langchain`: Main LangChain library
- `ethers`: Ethereum blockchain interaction
- `zod`: Runtime type validation

## Security Notes

- Never commit private keys to version control
- Use environment variables for sensitive configuration
- Validate all inputs before processing payments
- Monitor transaction receipts for successful execution