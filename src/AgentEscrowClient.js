import { ethers } from 'ethers';

// ============ Defaults ============

const DEFAULT_RPC_URL = 'https://mainnet.base.org';
const DEFAULT_CONTRACT_ADDRESS = '0x6AC844Ef070ee564ee40b81134b7707A3A4eb7eb';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

// ============ Minimal ABIs ============

const ESCROW_ABI = [
    'function createEscrow(address provider, uint256 amount, uint256 deadline) external returns (uint256 escrowId)',
    'function completeEscrow(uint256 escrowId) external',
    'function raiseDispute(uint256 escrowId) external',
    'function getEscrow(uint256 escrowId) external view returns (address client, address provider, uint256 amount, uint256 deadline, bool completed, bool disputed)',
    'function reputationScore(address) external view returns (int256)',
    'function escrowCount() external view returns (uint256)',
    'event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed provider, uint256 amount, uint256 deadline)',
    'event EscrowCompleted(uint256 indexed escrowId, address indexed provider, uint256 payout, uint256 fee)',
    'event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy)',
    'error InvalidAddress()',
    'error InvalidAmount()',
    'error InvalidDeadline()',
    'error InsufficientAllowance()',
    'error EscrowNotFound()',
    'error EscrowAlreadyCompleted()',
    'error EscrowAlreadyDisputed()',
    'error UnauthorizedCaller()',
];

const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
];

// ============ Error Mapping ============

const ERROR_MESSAGES = {
    InvalidAddress: 'Invalid address: provider cannot be zero address or same as caller',
    InvalidAmount: 'Invalid amount: escrow amount must be greater than zero',
    InvalidDeadline: 'Invalid deadline: must be in the future',
    InsufficientAllowance: 'Insufficient USDC allowance: call approveUSDC() first',
    EscrowNotFound: 'Escrow not found: the specified escrowId does not exist',
    EscrowAlreadyCompleted: 'Escrow already completed: cannot modify a completed escrow',
    EscrowAlreadyDisputed: 'Escrow already disputed: cannot modify a disputed escrow',
    UnauthorizedCaller: 'Unauthorized: caller is not permitted to perform this action',
};

/**
 * Production-grade client for the AgentEscrowProtocol on Base mainnet.
 *
 * @example
 * const client = new AgentEscrowClient({ privateKey: '0x...' });
 * await client.approveUSDC('100');
 * const { escrowId } = await client.createEscrow(providerAddr, '100', 3600);
 */
class AgentEscrowClient {
    /**
     * @param {Object} config
     * @param {string} config.privateKey - Hex-encoded private key (with or without 0x prefix)
     * @param {string} [config.rpcUrl] - JSON-RPC endpoint (defaults to Base mainnet)
     * @param {string} [config.contractAddress] - Protocol contract address
     */
    constructor({ privateKey, rpcUrl, contractAddress } = {}) {
        if (!privateKey || typeof privateKey !== 'string') {
            throw new Error('privateKey is required and must be a non-empty string');
        }

        const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

        if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedKey)) {
            throw new Error('privateKey must be a valid 32-byte hex string');
        }

        this.rpcUrl = rpcUrl || DEFAULT_RPC_URL;
        this.contractAddress = contractAddress || DEFAULT_CONTRACT_ADDRESS;
        this.usdcAddress = USDC_ADDRESS;

        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        this.signer = new ethers.Wallet(normalizedKey, this.provider);
        this.address = this.signer.address;
        this.contract = new ethers.Contract(this.contractAddress, ESCROW_ABI, this.signer);
        this.usdc = new ethers.Contract(this.usdcAddress, ERC20_ABI, this.signer);
    }

    // ============ Static Helpers ============

    /**
     * Converts a human-readable USDC amount to its 6-decimal BigInt representation.
     *
     * @param {string|number} amount - Human-readable amount (e.g. "100" or "0.50")
     * @returns {bigint} Amount in smallest USDC unit
     */
    static parseUSDC(amount) {
        return ethers.parseUnits(String(amount), USDC_DECIMALS);
    }

    // ============ Write Methods ============

    /**
     * Approves the protocol contract to spend USDC on behalf of the signer.
     *
     * @param {string|number} amount - Human-readable USDC amount to approve
     * @returns {Promise<{ hash: string, receipt: object, gasUsed: bigint }>}
     */
    async approveUSDC(amount) {
        const parsed = AgentEscrowClient.parseUSDC(amount);
        return this._sendTransaction(() => this.usdc.approve(this.contractAddress, parsed));
    }

    /**
     * Creates a new escrow agreement.
     *
     * @param {string} provider - Ethereum address of the service provider
     * @param {string|number} amount - Human-readable USDC amount to escrow
     * @param {number} durationSeconds - Escrow duration from now, in seconds
     * @returns {Promise<{ escrowId: bigint, hash: string, receipt: object, gasUsed: bigint }>}
     */
    async createEscrow(provider, amount, durationSeconds) {
        const parsed = AgentEscrowClient.parseUSDC(amount);
        const now = Math.floor(Date.now() / 1000);
        const deadline = BigInt(now + durationSeconds);

        const { hash, receipt, gasUsed } = await this._sendTransaction(() =>
            this.contract.createEscrow(provider, parsed, deadline)
        );

        // Extract escrowId from the EscrowCreated event
        const escrowId = this._extractEscrowId(receipt);

        return { escrowId, hash, receipt, gasUsed };
    }

    /**
     * Completes an escrow, releasing funds to the provider (minus protocol fee).
     *
     * @param {bigint|number} escrowId
     * @returns {Promise<{ hash: string, receipt: object, gasUsed: bigint }>}
     */
    async completeEscrow(escrowId) {
        return this._sendTransaction(() => this.contract.completeEscrow(escrowId));
    }

    /**
     * Raises a dispute on an active escrow.
     *
     * @param {bigint|number} escrowId
     * @returns {Promise<{ hash: string, receipt: object, gasUsed: bigint }>}
     */
    async raiseDispute(escrowId) {
        return this._sendTransaction(() => this.contract.raiseDispute(escrowId));
    }

    // ============ Read Methods ============

    /**
     * Returns the on-chain reputation score for an address.
     *
     * @param {string} address - Ethereum address to query
     * @returns {Promise<bigint>} Reputation score as BigInt
     */
    async getReputation(address) {
        const score = await this.contract.reputationScore(address);
        return score;
    }

    /**
     * Returns the full escrow struct for a given ID.
     *
     * @param {bigint|number} escrowId
     * @returns {Promise<{ client: string, provider: string, amount: bigint, deadline: bigint, completed: boolean, disputed: boolean }>}
     */
    async getEscrow(escrowId) {
        const [client, provider, amount, deadline, completed, disputed] =
            await this.contract.getEscrow(escrowId);

        return { client, provider, amount, deadline, completed, disputed };
    }

    // ============ Internal ============

    /**
     * Sends a transaction with structured error handling.
     * @private
     */
    async _sendTransaction(txFn) {
        try {
            const tx = await txFn();
            const receipt = await tx.wait();
            return { hash: receipt.hash, receipt, gasUsed: receipt.gasUsed };
        } catch (error) {
            throw this._parseError(error);
        }
    }

    /**
     * Extracts escrowId from EscrowCreated event in a transaction receipt.
     * @private
     */
    _extractEscrowId(receipt) {
        for (const log of receipt.logs) {
            try {
                const parsed = this.contract.interface.parseLog({
                    topics: log.topics,
                    data: log.data,
                });
                if (parsed && parsed.name === 'EscrowCreated') {
                    return parsed.args.escrowId;
                }
            } catch {
                // Log does not belong to this contract interface — skip
            }
        }
        throw new Error('Failed to extract escrowId: EscrowCreated event not found in receipt');
    }

    /**
     * Parses contract revert errors into human-readable messages.
     * @private
     */
    _parseError(error) {
        // Handle ethers ContractTransactionError with decoded custom errors
        if (error?.revert) {
            const name = error.revert.name;
            if (ERROR_MESSAGES[name]) {
                return new Error(ERROR_MESSAGES[name]);
            }
        }

        // Handle raw error data decoding
        const errorData = error?.data || error?.error?.data;
        if (errorData && errorData !== '0x') {
            try {
                const decoded = this.contract.interface.parseError(errorData);
                if (decoded && ERROR_MESSAGES[decoded.name]) {
                    return new Error(ERROR_MESSAGES[decoded.name]);
                }
            } catch {
                // Could not decode — fall through
            }
        }

        // Handle common provider / signer errors
        const message = error?.message || String(error);

        if (message.includes('insufficient funds')) {
            return new Error('Insufficient ETH balance to pay for gas');
        }
        if (message.includes('nonce has already been used')) {
            return new Error('Nonce conflict: transaction nonce already used');
        }

        return error instanceof Error ? error : new Error(message);
    }
}

export { AgentEscrowClient, DEFAULT_RPC_URL, DEFAULT_CONTRACT_ADDRESS, USDC_ADDRESS };
