import { EventEmitter } from "events";
import {
    IAgentRuntime,
} from "@ai16z/eliza/src/types.ts";
import { SolanaAdapter, SubscriberDetails } from 'fxn-protocol-sdk';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, Transaction, TransactionSignature } from '@solana/web3.js';
import bs58 from 'bs58';
import {signMessage} from "./utils/signingUtils.ts";
import {
    createTransferInstruction,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    getMint,
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { AgentParams, SubscriptionDetails } from "fxn-protocol-sdk/dist/client/fxn-solana-adapter";

interface TransferResult {
    signature: string;
    status: 'success' | 'error';
    message?: string;
}


export class FxnClient extends EventEmitter {
    protected runtime: IAgentRuntime;
    private solanaAdapter: SolanaAdapter;
    private hostPublicKey: PublicKey;
    private requestsTimer: NodeJS.Timeout | null = null;

    constructor({ runtime }: { runtime: IAgentRuntime }) {
        super();
        this.runtime = runtime;
        const provider = this.createAnchorProvider();
        this.solanaAdapter = new SolanaAdapter(provider);
        this.hostPublicKey = new PublicKey(this.runtime.getSetting("GAIM_HOST_PUBLIC_KEY"));
        this.initialize();
    }

    private async initialize() {
        const role = this.runtime.getSetting("GAIM_ROLE");
        if (role == "HOST") {
            await this.initializeHost();
            console.log("Host provider initialized.");
        }
        if (role == "PLAYER") {
            await this.initializePlayer();
            console.log("Player initialized.");
        }
    }

    private async initializePlayer() {
        // Find our gamemaster
        const hostDetails = await this.getHostParams();
        if (!hostDetails) {
            console.error("Error: Failed to find GAIM host with key", this.hostPublicKey.toString());
            return;
        }

        console.log("Found gamemaster: " + hostDetails.name);
        console.log("Current Subscribers:");
        const hostSubscribers = await this.getHostSubscribers();
        console.log(hostSubscribers);

        // Subscribe to the host or renew our subscription
        const subscriptions = await this.getSubscriptions();
        const subscribed = subscriptions.find((subscription) => {
            console.log(subscription.dataProvider.toString() == this.hostPublicKey.toString());
            return subscription.dataProvider.toString() == this.hostPublicKey.toString();
        });

        if (!subscribed) {
            console.log("Subscribing to host.");
            await this.subscribeToHost();
        } else {
            console.log("Already subscribed to host.");
            console.log(subscribed);
        }
    }

    private async initializeHost() {
        // Register this gamemaster with FXN if we haven't already
        let hostDetails = await this.getHostParams();
        if (!hostDetails) {
            const regSig = await this.registerHost();
            console.log("Host registered: ", regSig);

            hostDetails = await this.getHostParams();
        }

        console.log("Found gamemaster: " + hostDetails.name);

        // If players have to request subscriptions, start the approval cycle
        if (hostDetails.restrict_subscriptions) {
            this.startApproveRequestsCycle();
        }
    }

    private async startApproveRequestsCycle() {
        if (this.requestsTimer) {
            clearTimeout(this.requestsTimer);
        }

        await this.approveAllSubscriptionRequests();

        const duration = parseFloat(this.runtime.getSetting("GAIM_HOST_APPROVE_REQUESTS_INTERVAL"));
        this.requestsTimer = setTimeout(this.startApproveRequestsCycle, duration)
    }

    public async getHostParams(): Promise<AgentParams> | null {
        try {
            return await this.solanaAdapter.getAgentDetails(this.hostPublicKey);
        } catch (error) {
            console.log("Failed to find host", this.hostPublicKey.toString());
            return;
        }
    }

    public async registerHost(): Promise<TransactionSignature> {
        const agentParams = {
            name: this.runtime.getSetting("GAIM_HOST_NAME"),
            description: this.runtime.getSetting("GAIM_HOST_DESCRIPTION"),
            restrict_subscriptions: this.runtime.getSetting("GAIM_HOST_RESTRICT_SUBSCRIPTIONS") == "true",
            capabilities: ["text post"],
            fee: parseFloat(this.runtime.getSetting("GAIM_HOST_FEE"))
        }

        return this.solanaAdapter.registerAgent(agentParams);
    }

    public async subscribeToHost(): Promise<TransactionSignature> {
        const hostParams = await this.getHostParams();
        console.log("Host Params:");
        console.log(hostParams);
        if (hostParams.restrict_subscriptions) {
            // Request a subscription
            const subscriptionSig =  await this.solanaAdapter.requestSubscription({dataProvider: this.hostPublicKey});
            console.log("Requested subscription", subscriptionSig);
            return subscriptionSig;
        } else {
            // Create a subscription
            const url = this.runtime.getSetting("GAIM_PLAYER_URL");
            const port = this.runtime.getSetting("SERVER_PORT");
            const [subSig, _] = await this.solanaAdapter.createSubscription({
                dataProvider: this.hostPublicKey,
                recipient: `${url}:${port}`,
                durationInDays: 30
            });

            console.log("Created subscription", subSig);
            return subSig;
        }
    }

    public async unsubscribeFromHost(): Promise<TransactionSignature> {
        return await this.solanaAdapter.cancelSubscription({
            dataProvider: this.hostPublicKey,
            qualityScore: 100
        });
    }

    public async getSubscriptionRequests() {
        const dataProvider = new PublicKey(this.runtime.getSetting("WALLET_PUBLIC_KEY"));
        return await this.solanaAdapter.getSubscriptionRequests(dataProvider);
    }

    public async approveAllSubscriptionRequests() {
        const requests = await this.getSubscriptionRequests();
        const unapproved = requests.filter((request) => {!request.approved});
        console.log(unapproved.length, "pending requests to approve.")

        unapproved.forEach(async (request, index) => {
            const approveSig = await this.solanaAdapter.approveSubscriptionRequest({
                subscriberAddress: request.subscriberPubkey,
                requestIndex: index
            });
            console.log("Approved request from", request.subscriberPubkey, approveSig);
        });
    }

    /**
     * todo configure the content format
     * @param content
     * @param subscribers
     * @protected
     */
    public async broadcastToSubscribers(content: any, subscribers: Array<any>) {
        // console.log('Gonna broadcast - subscribers are ', subscribers);
        const promises = subscribers.map(async (subscriber) => {
            try {
                const privateKey = this.runtime.getSetting("WALLET_PRIVATE_KEY")!;
                const privateKeyUint8Array = bs58.decode(privateKey);
                // Create keypair from private key
                const keypair = Keypair.fromSecretKey(privateKeyUint8Array);

                const signedPayload = await signMessage(keypair, content);
                const recipient = subscriber.subscription?.recipient;

                console.log('Subscriber fields are ', recipient, subscriber.status);

                if (recipient && subscriber.status === 'active') {
                    return fetch(recipient, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(signedPayload)
                    });
                }
            } catch (error) {
                console.error(`Failed to broadcast to subscriber`, subscriber, error);
            }
        });

        return Promise.allSettled(promises);
    }

    // Only broadcast to a specific subscriber
    public async broadcastToSubscriber(content: any, subscriber: SubscriberDetails) {
        try {
            const privateKey = this.runtime.getSetting("WALLET_PRIVATE_KEY")!;
            const privateKeyUint8Array = bs58.decode(privateKey);
            // Create keypair from private key
            const keypair = Keypair.fromSecretKey(privateKeyUint8Array);

            const signedPayload = await signMessage(keypair, content);
            const recipient = subscriber.subscription?.recipient;

            console.log('Subscriber fields are ', recipient, subscriber.status);

            if (recipient && subscriber.status === 'active') {
                return fetch(recipient, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(signedPayload)
                });
            }
        } catch (error) {
            console.error(`Failed to broadcast to subscriber`, subscriber, error);
        }
    }

    public async getSubscribers(): Promise<SubscriberDetails[]> {
        const agentId = new PublicKey(this.runtime.getSetting("WALLET_PUBLIC_KEY"));
        try {
            return await this.solanaAdapter.getSubscriptionsForProvider(agentId);
        } catch (error) {
            console.log("No subscribers found!");
            return [];
        }
    }

    public async getHostSubscribers(): Promise<SubscriberDetails[]> {
        try {
            return await this.solanaAdapter.getSubscriptionsForProvider(this.hostPublicKey);
        } catch (error) {
            console.log("No subscribers found!");
            return [];
        }
    }

    public async getSubscriptions(): Promise<SubscriptionDetails[]> {
        const agentId = new PublicKey(this.runtime.getSetting("WALLET_PUBLIC_KEY"));
        try {
            return await this.solanaAdapter.getAllSubscriptionsForUser(agentId);
        } catch (error) {
            console.log("No subscriptions found!");
            return [];
        }
    }

    /**
     * Creates a mainnet-specific provider for token transfers
     */
    private createMainnetProvider(): AnchorProvider {
        const mainnetRpcUrl = this.runtime.getSetting("MAINNET_RPC_URL");
        const privateKey = this.runtime.getSetting("WALLET_PRIVATE_KEY")!;

        // Convert base58 private key to Uint8Array
        const privateKeyUint8Array = bs58.decode(privateKey);

        // Create keypair from private key
        const keypair = Keypair.fromSecretKey(privateKeyUint8Array);

        // Create mainnet connection using the RPC URL
        const connection = new Connection(mainnetRpcUrl, 'confirmed');

        // Create wallet instance
        const wallet = new Wallet(keypair);

        // Create and return the provider
        return new AnchorProvider(
            connection,
            wallet,
            { commitment: 'confirmed' }
        );
    }

    protected createAnchorProvider(): AnchorProvider {
        const rpcUrl = this.runtime.getSetting("RPC_URL");
        const privateKey = this.runtime.getSetting("WALLET_PRIVATE_KEY")!;

        // Convert base58 private key to Uint8Array
        const privateKeyUint8Array = bs58.decode(privateKey);

        // Create keypair from private key
        const keypair = Keypair.fromSecretKey(privateKeyUint8Array);

        // Create connection using the RPC URL
        const connection = new Connection(rpcUrl, 'confirmed');

        // Create wallet instance
        const wallet = new Wallet(keypair);

        // Create and return the provider
        return new AnchorProvider(
            connection,
            wallet,
            { commitment: 'confirmed' }
        );
    }

    /**
     * Transfer tokens to a recipient on mainnet
     * @param recipientPublicKey - The public key of the reward recipient
     * @param amount - The amount of tokens to transfer (in human-readable format)
     * @returns Promise<TransferResult>
     */
    public async transferRewardTokens(
        recipientPublicKey: string,
        amount: number
    ): Promise<TransferResult> {
        try {
            const rewardTokenCA = this.runtime.getSetting('GAIM_MAINNET_REWARD_TOKEN');
            if (!rewardTokenCA) {
                throw new Error('Reward token CA not configured');
            }

            // Use mainnet provider instead of default devnet provider
            const mainnetProvider = this.createMainnetProvider();
            const rewardTokenPubKey = new PublicKey(rewardTokenCA);
            const recipientPubKey = new PublicKey(recipientPublicKey);

            // Get token mint info to get decimals
            const mintInfo = await getMint(
                mainnetProvider.connection,
                rewardTokenPubKey
            );

            // Calculate the actual amount with decimals
            const adjustedAmount = amount * Math.pow(10, mintInfo.decimals);

            // Get the associated token accounts
            const fromTokenAccount = await getAssociatedTokenAddress(
                rewardTokenPubKey,
                mainnetProvider.wallet.publicKey
            );

            const toTokenAccount = await getAssociatedTokenAddress(
                rewardTokenPubKey,
                recipientPubKey
            );

            // Create transaction
            const transaction = new Transaction();

            // Check if recipient's token account exists on mainnet
            const recipientAccountInfo = await mainnetProvider.connection.getAccountInfo(toTokenAccount);

            if (!recipientAccountInfo) {
                console.log('Creating associated token account for recipient on mainnet');
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        mainnetProvider.wallet.publicKey,  // payer
                        toTokenAccount,             // ata
                        recipientPubKey,            // owner
                        rewardTokenPubKey           // mint
                    )
                );
            }

            // Add transfer instruction with adjusted amount
            transaction.add(
                createTransferInstruction(
                    fromTokenAccount,
                    toTokenAccount,
                    mainnetProvider.wallet.publicKey,
                    adjustedAmount
                )
            );

            // Send and confirm transaction on mainnet
            const signature = await mainnetProvider.sendAndConfirm(
                transaction,
                [],
                {
                    maxRetries: 3,
                    skipPreflight: true,
                    commitment: 'confirmed',
                }
            );

            return {
                signature,
                status: 'success',
                message: `Successfully transferred ${amount} tokens to ${recipientPublicKey}`
            };

        } catch (error) {
            console.error('Token transfer failed:', error);
            return {
                signature: '',
                status: 'error',
                message: error.message
            };
        }
    }

    protected onReady() {
        throw new Error("onReady not implemented in base class");
    }
}
