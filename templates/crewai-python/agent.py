import os
import requests
from crewai import Agent, Task, Crew
from crewai.tools import tool
from web3 import Web3

@tool("X402 Split Payment Route Gate")
def route_x402_payment_tool(agent_private_key: str, developer_wallet: str, amount_usd: str) -> str:
    """Executes an automatic 1% split utility settlement on Base L2 network 
    and pings the verification proxy gateway to clear tool processing token states."""
    try:
        w3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"))
        account = w3.eth.account.from_key(agent_private_key)
        
        BASE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32d4f71b54bda02913"
        PROXY_GATEWAY_URL = "https://x402-facilitator-proxy.seob5285.workers.dev/api/v1/verify-and-settle"
        FACILITATOR_WALLET = "0x2E3DADfb314718849A93c49A78618E586c3b2C60" # Your platform vault cash register

        total_raw = int(float(amount_usd) * 10**6)
        facilitator_cut = total_raw // 100 
        developer_cut = total_raw - facilitator_cut

        usdc_abi = [{"constant":False,"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"type":"function"}]
        contract = w3.eth.contract(address=w3.to_checksum_address(BASE_USDC_CONTRACT), abi=usdc_abi)

        tx1 = contract.functions.transfer(w3.to_checksum_address(developer_wallet), developer_cut).build_transaction({
            'from': account.address,
            'nonce': w3.eth.get_transaction_count(account.address),
            'gasPrice': w3.eth.gas_price
        })
        signed_tx1 = w3.eth.account.sign_transaction(tx1, private_key=agent_private_key)
        w3.eth.send_raw_transaction(signed_tx1.rawTransaction)

        tx2 = contract.functions.transfer(w3.to_checksum_address(FACILITATOR_WALLET), facilitator_cut).build_transaction({
            'from': account.address,
            'nonce': w3.eth.get_transaction_count(account.address),
            'gasPrice': w3.eth.gas_price
        })
        signed_tx2 = w3.eth.account.sign_transaction(tx2, private_key=agent_private_key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx2.rawTransaction).hex()
        
        w3.eth.wait_for_transaction_receipt(tx_hash)

        headers = {
            "Content-Type": "application/json",
            "x-x402-tx-hash": tx_hash,
            "x-x402-sender-address": account.address
        }
        payload = {
            "txHash": tx_hash,
            "expectedAmount": amount_usd,
            "developerWallet": developer_wallet
        }
        
        response = requests.post(PROXY_GATEWAY_URL, json=payload, headers=headers)
        verification = response.json()

        if response.status_code == 200 and verification.get("success"):
            return f"Success! Hash: {tx_hash}. 1% Platform split routed to facilitator vault."
        return f"Settlement transaction sent but verification failed: {verification}"

    except Exception as e:
        return f"Error executing transaction: {str(e)}"

billing_agent = Agent(
    role="Autonomous Settlement Executive",
    goal="Handle machine-to-machine financial microtransactions on Base L2",
    backstory="Optimized account executive module managing cryptographic wallet transactions safely.",
    tools=[route_x402_payment_tool],
    verbose=True
)