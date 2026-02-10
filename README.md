# Agent Escrow SDK

Production-grade Node.js SDK for the **AgentEscrowProtocol** deployed on Base mainnet.

Enables autonomous agents and backends to create, manage, and settle USDC escrow agreements on-chain — with built-in reputation tracking and dispute resolution.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Your Agent / Backend                │
│                                                  │
│   const client = new AgentEscrowClient({...})    │
│   await client.createEscrow(provider, amt, dur)  │
└──────────────────────┬──────────────────────────┘
                       │ ethers v6
                       ▼
┌──────────────────────────────────────────────────┐
│              Base Mainnet (Chain 8453)            │
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │  AgentEscrowProtocol                     │   │
│   │  0x6AC844Ef070ee564ee40b81134b7707A3A4eb7eb │
│   │                                          │   │
│   │  • createEscrow()    • completeEscrow()  │   │
│   │  • raiseDispute()    • getEscrow()       │   │
│   │  • reputationScore()                     │   │
│   └──────────────────────────────────────────┘   │
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │  USDC (ERC-20)                           │   │
│   │  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 │
│   └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

## Installation

```bash
npm install agent-escrow-sdk
```

> Requires Node.js ≥ 18. Single runtime dependency: `ethers` v6.

## Quick Start

```js
import { AgentEscrowClient } from 'agent-escrow-sdk';

const client = new AgentEscrowClient({
  privateKey: process.env.PRIVATE_KEY,
});

// Approve 50 USDC for the protocol
await client.approveUSDC('50');

// Create a 1-hour escrow for 50 USDC
const { escrowId } = await client.createEscrow(
  '0xProviderAddress',
  '50',
  3600
);

// Complete the escrow — provider receives funds minus 2.5% fee
await client.completeEscrow(escrowId);
```

## Autonomous Agent Workflow

```js
import { AgentEscrowClient } from 'agent-escrow-sdk';

const client = new AgentEscrowClient({
  privateKey: process.env.AGENT_PRIVATE_KEY,
});

async function executeTask(providerAddress, usdcAmount, taskDurationSecs) {
  // 1. Approve USDC spend
  await client.approveUSDC(usdcAmount);

  // 2. Lock funds in escrow
  const { escrowId } = await client.createEscrow(
    providerAddress,
    usdcAmount,
    taskDurationSecs
  );

  // 3. Wait for off-chain task completion...
  const taskSucceeded = await performOffChainWork();

  if (taskSucceeded) {
    // 4a. Release payment to provider
    await client.completeEscrow(escrowId);
  } else {
    // 4b. Raise dispute for resolution
    await client.raiseDispute(escrowId);
  }

  // 5. Check provider reputation
  const rep = await client.getReputation(providerAddress);
  return { escrowId, reputation: rep };
}
```

## API Reference

### Constructor

```js
new AgentEscrowClient({ privateKey, rpcUrl?, contractAddress? })
```

| Parameter | Type | Required | Default |
|---|---|---|---|
| `privateKey` | `string` | ✅ | — |
| `rpcUrl` | `string` | — | `https://mainnet.base.org` |
| `contractAddress` | `string` | — | Deployed protocol address |

### Write Methods

All write methods return `{ hash, receipt, gasUsed }`.

| Method | Description |
|---|---|
| `approveUSDC(amount)` | Approve protocol to spend USDC |
| `createEscrow(provider, amount, durationSeconds)` | Create escrow — also returns `escrowId` |
| `completeEscrow(escrowId)` | Release funds to provider |
| `raiseDispute(escrowId)` | Flag escrow for dispute resolution |

### Read Methods

| Method | Returns |
|---|---|
| `getEscrow(escrowId)` | `{ client, provider, amount, deadline, completed, disputed }` |
| `getReputation(address)` | `bigint` reputation score |

### Static Helpers

| Method | Description |
|---|---|
| `AgentEscrowClient.parseUSDC(amount)` | Convert human-readable amount → 6-decimal `bigint` |

## Contract Details

| | |
|---|---|
| **Network** | Base Mainnet (Chain ID 8453) |
| **Contract** | [`0x6AC844Ef070ee564ee40b81134b7707A3A4eb7eb`](https://basescan.org/address/0x6AC844Ef070ee564ee40b81134b7707A3A4eb7eb) |
| **USDC** | [`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`](https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) |
| **Protocol Fee** | 2.5% (250 basis points) |
| **RPC** | `https://mainnet.base.org` |

## Security Notes

- **Private key handling** — The SDK validates key format at construction time but never logs, stores, or transmits it. Always load keys from environment variables or a secure vault; never commit them to source control.
- **Allowance management** — Call `approveUSDC()` with only the amount you need. Avoid unlimited approvals in production agent workflows.
- **Deadline calculation** — `createEscrow` computes deadlines from `Date.now()`. Ensure the host clock is accurate, or pass a custom RPC with a trusted block-time source.
- **Gas estimation** — The SDK relies on ethers' default gas estimation. On Base mainnet, gas costs are minimal, but callers should monitor the signer's ETH balance.
- **Error boundaries** — All contract reverts are decoded into human-readable messages. Wrap SDK calls in your own error handling for retry logic or alerting.

## License

MIT
