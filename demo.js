import { AgentEscrowClient } from './index.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new AgentEscrowClient({
    privateKey: process.env.PRIVATE_KEY,
});

async function runDemo() {
    const myAddress = client.address;
    const demoProvider = "0x000000000000000000000000000000000000dEaD"; // Cannot escrow to self

    const network = await client.provider.getNetwork();
    console.log("Connected to Chain ID:", network.chainId.toString());
    console.log("USDC Address:", client.usdcAddress);
    console.log("Protocol Address:", client.contractAddress);

    // 1️⃣ Approve 0.1 USDC
    console.log("Approving 0.001 USDC...");
    const approveTx = await client.approveUSDC("0.001");
    console.log("Approval Tx:", approveTx.hash);

    // Verify allowance manually
    const allowance = await client.usdc.allowance(myAddress, client.contractAddress);
    console.log("Current Allowance:", allowance.toString());

    const balance = await client.usdc.balanceOf(myAddress);
    console.log("Current USDC Balance:", balance.toString());

    if (allowance < client.constructor.parseUSDC("0.001")) {
        console.error("❌ Allowance failed to update! Waiting 2s...");
        await new Promise(r => setTimeout(r, 2000));
    }

    // 2️⃣ Create escrow for a provider
    console.log("Creating escrow for provider:", demoProvider);
    const { escrowId } = await client.createEscrow(
        demoProvider,
        "0.001",
        600 // 10 minutes
    );

    console.log("Escrow ID:", escrowId);

    // 3️⃣ Complete escrow
    console.log("Completing escrow...");
    await client.completeEscrow(escrowId);

    console.log("Escrow completed successfully.");

    // 4️⃣ Check reputation
    const rep = await client.getReputation(myAddress);
    console.log("Reputation:", rep.toString());
}

runDemo().catch(console.error);
