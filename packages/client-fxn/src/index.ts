// packages/direct-client/src/index.ts
import express from 'express';
import bodyParser from 'body-parser';
import {IAgentRuntime} from '@ai16z/eliza/src/types.ts';
import { ActionHistory, ActionHistoryEntry, PlayerState, PokerManager, TableState } from './pokerManager.ts';
import {FxnClient} from "./fxnClient.ts";
import {verifyMessage} from "./utils/signingUtils.ts";

export class FxnClientInterface {
    private app: express.Express;
    private gameManager: PokerManager;
    private fxnClient: FxnClient;

    constructor(private runtime: IAgentRuntime) {
        this.app = express();
        this.app.use(bodyParser.json());

        const role = this.runtime.getSetting("GAIM_ROLE");
        console.log('GAIM Role is', role);
        if (role) {
            this.setupGame(role);
        }
    }

    private setupGame(role: string) {
        this.fxnClient = new FxnClient({ runtime: this.runtime });
        if (role === 'PLAYER') {
            this.setupRoutes();
        }
        if (role === 'HOST') {
            this.setupGameLoop();
        }
        const port = this.runtime.getSetting("SERVER_PORT") || 3000;
        this.app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    }

    private async setupGameLoop() {
        this.gameManager = new PokerManager(this.fxnClient);
    }

    // This is where subscribers are going to respond to the POST requests we send out in the manager
    // This will always include the full public state of the table
    // It will also include the hole cards that belong to the subscriber
    private setupRoutes() {
        console.log('Setting up routes for player');
        const handleRequest = async (req: any, res: any) => {
            try {
                const { publicKey, signature, payload } = req.body;

                // Add debug logging
                console.log('Received POST request:', {
                    path: req.path,
                    body: req.body,
                    headers: req.headers
                });

                // Get the game master's public key
                const gameMasterKey = this.runtime.getSetting("GAIM_HOST_PUBLIC_KEY");

                // Verify that the message came from the game master
                const verificationResult = await verifyMessage({
                    payload,
                    signature,
                    publicKey: gameMasterKey
                });

                if (!verificationResult.isValid) {
                    return res.status(401).json({
                        error: 'Invalid signature',
                        details: 'Message signature verification failed'
                    });
                }

                // Generate an action based on the board state
                const tableState: TableState = payload.tableState;
                const playerState: PlayerState = payload.playerState;
                const actionHistory: ActionHistory = payload.actionHistory;

                if (tableState.playerToActKey == this.runtime.getSetting("WALLET_PUBLIC_KEY")) {
                    // It is this player's turn

                    // Determine an action to take and a bet size if applicable

                    // Include it in the response
                    return res.json({
                        action: "check",
                        betSize: 0
                    });
                } else {
                    // Return success (no content)
                    return res.status(204);
                }

            } catch (error) {
                console.error('Error processing request:', error);
                res.status(500).json({
                    error: 'Internal server error',
                    details: error.message
                });
            }
        };

        // Register the handler for both paths
        this.app.post('/', handleRequest);
        this.app.post('', handleRequest);
    }

    private generatePokerPrompt(tableState: TableState, playerState: PlayerState, actionHistory: ActionHistory): string {
        return `
            You are a poker agent playing Texas Hold'em.

            Assess the current situation and decide what kind of bet to make.

            Your current properties are:
            - Chips: {chips}
            - Hand: {hand}

            Take into account the community cards and the current bet value to make your decision:
            - Community Cards: {community_cards}
            - Current Bet: {current_bet}

            Review the bet history and opponent behavior to make your decision:
            - Bet History: {bet_history}

            Based on this information, decide your next move. Your options are:
            - Fold: If your hand is weak and opponents show strength.
            - Call: If the bet value is reasonable and your hand has potential.
            - Raise: If your hand is strong and you want to increase the pot size or bluff.
            - Check: If no bet is required and you want to see the next card for free.

            You must have enough chips to call or raise.

            Make a decision now and provide a brief explanation for your choice.

            Format Instructions: {format_instructions}
        `;
    }

    static async start(runtime: IAgentRuntime) {
        console.log('Starting FXN Client');
        return new FxnClientInterface(runtime);
    }

    async stop() {
        // Cleanup code if needed
        console.log('Stopping direct client');
    }
}
