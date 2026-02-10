# Agent Escrow SDK

> The trust layer for autonomous agent payments — deployed, tested, and live on Base mainnet.

**`agent-escrow-sdk`** is the official Node.js SDK for the [AgentEscrowProtocol](https://github.com/Agastya910/agent-escrow-protocol) — a production smart contract that lets AI agents pay each other safely using USDC on Base (Coinbase's L2 network).

```bash
npm install agent-escrow-sdk
```

---

## The Problem

OpenClaw agents are **goal-oriented.** If you tell an agent to _"Research a topic and write a report,"_ it might need to hire another agent — or a human — to help.

But how does **Agent A** pay **Agent B** without getting scammed?

- If Agent A pays **upfront** → Agent B might run away with the money.
- If Agent A pays **after** → Agent B does the work and Agent A never sends the payment.

This is the **trust problem** at the heart of the AI-native economy. No trust layer means no agent commerce.

## The Solution

The **[AgentEscrowProtocol](https://github.com/Agastya910/agent-escrow-protocol)** is a smart contract vault that holds USDC in escrow until both sides are satisfied. The **SDK** gives your agent a simple interface to use it.

No middleman. No trust required. Just code.

---

## How It Works

### 1. The Lock-Up (`createEscrow`)

Instead of sending money directly to someone's wallet, your agent puts USDC into the smart contract vault. The money is now **in limbo** — the provider can see it's there, but they can't touch it yet.

### 2. The Work Phase

The other agent (or person) sees the money is locked and safe, so they feel **confident doing the work.** The escrow has a deadline — both parties know the rules.

### 3. The Release (`completeEscrow`)

Once your agent confirms the work is done (e.g., it received the report, the API call succeeded, the translation was delivered), it calls the SDK to **unlock the vault.** The USDC automatically transfers to the provider, minus a 2.5% protocol fee.

### 4. The Safety Net (`raiseDispute`)

If the work is bad or never arrives, your agent can **freeze the escrow** so the provider can't take the money. A resolution process decides who gets the refund.

```
  Agent A                    Smart Contract Vault                Agent B
    │                              │                               │
    │──── Lock 100 USDC ──────────▶│                               │
    │                              │ Money is visible but locked   │
    │                              │◀────── Does the work ─────────│
    │                              │                               │
    │──── Release (confirm) ──────▶│                               │
    │                              │──── 97.50 USDC ──────────────▶│
    │                              │──── 2.50 fee ──▶ Protocol     │
    │                              │                               │
    │              ✅ Reputation +1 for Agent B                     │
```

---

## Reputation System

Every completed escrow **increases the provider's on-chain reputation score.** Every lost dispute **decreases it.**

This creates a verifiable trust graph:

- Agents with **high reputation** get hired more often.
- Agents with **zero or negative reputation** get avoided.
- The scores live **on-chain** — no one can fake them, and anyone can query them.

```js
const reputation = await client.getReputation("0xAgentAddress");
// Returns a BigInt: positive = trustworthy, negative = risky
```

Over time, this reputation ledger becomes the **credit score of the AI economy.** Agents, platforms, and humans all reference it to decide who to trust.

---

## Why This Is Safe

| Guarantee                   | How                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Funds can't be stolen**   | USDC is held by an immutable smart contract, not a person or company                                                                           |
| **No rug pulls**            | The contract is deployed and verified on Base — [view it on Basescan](https://basescan.org/address/0x6AC844Ef070ee564ee40b81134b7707A3A4eb7eb) |
| **Reentrancy protection**   | Built with OpenZeppelin's `ReentrancyGuard`                                                                                                    |
| **Safe token transfers**    | Uses OpenZeppelin's `SafeERC20` — no silent failures                                                                                           |
| **Dispute mechanism**       | Either party can freeze funds if something goes wrong                                                                                          |
| **Private keys stay local** | The SDK never logs, stores, or transmits your private key                                                                                      |

---

## Quick Start

```bash
npm install agent-escrow-sdk
```

```js
import { AgentEscrowClient } from "agent-escrow-sdk";

const client = new AgentEscrowClient({
  privateKey: process.env.PRIVATE_KEY,
});

// 1. Approve USDC spend
await client.approveUSDC("50");

// 2. Create a 1-hour escrow for 50 USDC
const { escrowId } = await client.createEscrow("0xProviderAddress", "50", 3600);

// 3. Release payment when work is done
await client.completeEscrow(escrowId);
```

That's it. Three calls to go from **zero trust** to **trustless payment.**

---

## Autonomous Agent Workflow

This is how an OpenClaw agent would use the SDK in a real pipeline:

```js
import { AgentEscrowClient } from "agent-escrow-sdk";

const client = new AgentEscrowClient({
  privateKey: process.env.AGENT_PRIVATE_KEY,
});

async function hireAgent(providerAddress, usdcAmount, taskDurationSecs) {
  // 1. Approve USDC spend
  await client.approveUSDC(usdcAmount);

  // 2. Lock funds in escrow
  const { escrowId } = await client.createEscrow(
    providerAddress,
    usdcAmount,
    taskDurationSecs,
  );

  // 3. Wait for off-chain task completion
  const result = await performOffChainWork();

  if (result.success) {
    // 4a. Work is good → release payment
    await client.completeEscrow(escrowId);
  } else {
    // 4b. Work is bad → raise dispute
    await client.raiseDispute(escrowId);
  }

  // 5. Check updated reputation
  const rep = await client.getReputation(providerAddress);
  console.log(`Provider reputation: ${rep}`);
}
```

When thousands of agents start hiring each other for small tasks — $0.50 for a translation, $2 for a data scrape, $10 for a research report — they all use this protocol to handle the millions of tiny payments safely.

---

## The Protocol vs. The SDK

Think of this like a **Vending Machine** and its **Remote Control.**

| Component    | Where It Lives       | What It Does                                                                      |
| ------------ | -------------------- | --------------------------------------------------------------------------------- |
| **Protocol** | On-Chain (Base)      | The "truth" — holds USDC, enforces the 2.5% fee, tracks reputation                |
| **SDK**      | In your agent's code | The "interface" — translates `client.createEscrow()` into blockchain transactions |
| **OpenClaw** | On your server       | The "brain" — decides when to pay, how much, and to whom                          |

The protocol is deployed **once** and lives on the blockchain forever. The SDK is what your agent `npm install`s to interact with it.

---

## API Reference

### Constructor

```js
new AgentEscrowClient({ privateKey, rpcUrl?, contractAddress? })
```

| Parameter         | Type     | Required | Default                    |
| ----------------- | -------- | -------- | -------------------------- |
| `privateKey`      | `string` | ✅       | —                          |
| `rpcUrl`          | `string` | —        | `https://mainnet.base.org` |
| `contractAddress` | `string` | —        | Deployed protocol address  |

### Write Methods

All write methods return `{ hash, receipt, gasUsed }`.

| Method                                            | Description                                      |
| ------------------------------------------------- | ------------------------------------------------ |
| `approveUSDC(amount)`                             | Approve the protocol contract to spend your USDC |
| `createEscrow(provider, amount, durationSeconds)` | Lock funds in escrow — also returns `escrowId`   |
| `completeEscrow(escrowId)`                        | Release funds to the provider (minus 2.5% fee)   |
| `raiseDispute(escrowId)`                          | Freeze escrow for dispute resolution             |

### Read Methods

| Method                   | Returns                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `getEscrow(escrowId)`    | `{ client, provider, amount, deadline, completed, disputed }` |
| `getReputation(address)` | `bigint` — on-chain reputation score                          |

### Static Helpers

| Method                                | Description                                       |
| ------------------------------------- | ------------------------------------------------- |
| `AgentEscrowClient.parseUSDC(amount)` | Convert `"100"` → `100000000n` (6-decimal BigInt) |

---

## Contract Details

|                     |                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Network**         | Base Mainnet (Chain ID 8453)                                                                                            |
| **Contract**        | [`0x6AC844Ef070ee564ee40b81134b7707A3A4eb7eb`](https://basescan.org/address/0x6AC844Ef070ee564ee40b81134b7707A3A4eb7eb) |
| **USDC**            | [`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`](https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) |
| **Protocol Fee**    | 2.5% (250 basis points)                                                                                                 |
| **Protocol Source** | [Agastya910/agent-escrow-protocol](https://github.com/Agastya910/agent-escrow-protocol)                                 |
| **RPC**             | `https://mainnet.base.org`                                                                                              |

## Security Notes

- **Private key handling** — The SDK validates key format at construction time but never logs, stores, or transmits it. Always load keys from environment variables or a secure vault.
- **Allowance management** — Call `approveUSDC()` with only the amount you need. Avoid unlimited approvals in production.
- **Deadline calculation** — `createEscrow` computes deadlines from `Date.now()`. Ensure your host clock is accurate.
- **Gas costs** — Base L2 gas is minimal, but monitor your signer's ETH balance.
- **Error handling** — All contract reverts are decoded into human-readable messages. Wrap SDK calls in your own try/catch for retry logic.

## License

MIT
