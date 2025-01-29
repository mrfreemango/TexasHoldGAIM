// packages/direct-client/src/index.ts
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors'; // Import cors
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

        const allowedOrigin = 'http://localhost:3000'; // Define your frontend origin
        this.app.use(cors({
            origin: allowedOrigin,
            methods: ['GET', 'POST'],
            credentials: true
        }));

        const role = this.runtime.getSetting("GAIM_ROLE");
        console.log('GAIM Role is', role);
        if (role) {
            this.setupGame(role);
        }
    }

    private async setupGame(role: string) {
        this.fxnClient = new FxnClient({ runtime: this.runtime });
        await this.fxnClient.initialize();
        
        if (role === 'PLAYER') {
            this.setupRoutes();
        }
        if (role === 'HOST') {
            this.setupHostRoutes();
            this.setupGameLoop();
        }
        const port = this.runtime.getSetting("SERVER_PORT") || 3000;
        this.app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    }

    private setupGameLoop() {
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
                    const prompt = this.generatePokerPrompt(tableState, playerState, actionHistory);
                    console.log(prompt);

                    // Include it in the response
                    return res.json({
                        action: "check",
                        betSize: 0
                    });
                } else {
                    // Return success
                    return res.status(200);
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

    private setupHostRoutes() {
        this.app.get('/current-game-state', async (req, res) => {
            const tableState = this.gameManager.getTableState();
            const playerStates = this.gameManager.getSeatedPlayerStates();
            try {
                const currentGameState = {
                    potSize: tableState.pots,
                    communityCards: tableState.communityCards,
                    players: playerStates.map((playerState) => {
                        return {
                            id: playerState.publicKey,
                            name: playerState.name,
                            money: playerState.stack,
                            cards: playerState.holeCards,
                            isFolded: playerState.isFolded,
                            isDealer: playerState.isDealer,
                            isWinner: playerState.isWinner,
                            avatar: ""
                        }
                    }),
                    actionOn: tableState.playerToActName,
                    gameState: tableState.gameStateString,
                };

                // Send the hard-coded game state as a JSON response
                res.json(currentGameState);
            } catch (error) {
                console.error('Error serving host view:', error);
                res.status(500).send('Internal Server Error');
            }
        });
    }

    private generatePokerPrompt(tableState: TableState, playerState: PlayerState, actionHistory: ActionHistory): string {
        
        const formatCards = (cards: {rank: string, suit: string}[]): string => {
            const cardStrings = cards.map((card) => {
                return `${card.rank} of ${card.suit}`;
            });

            return cardStrings.join(", ");
        }

        const formatActionHistory = (actionHistory: ActionHistory): string => {
            const actionStrings = actionHistory.map((entry: ActionHistoryEntry) => {
                const actionString = entry.action != "bet" ? entry.action + "ed" : entry.action;
                const betString = entry.action == "bet" || entry.action == "raise" ? ` ${entry.betSize} dollars.` : "";
                return `During the ${entry.roundOfBetting}, ${entry.name} ${actionString}${betString}`;
            });

            return actionStrings.join(", ");
        }

        // Sum all the pots this player is eligible for
        const totalEligiblePotSize = tableState.pots.reduce((acc, cur) => {return acc + cur}, 0);

        const legalActions = tableState.playerToActLegalActions;
        
        return `
            Your name is ${playerState.name}, and you are a poker agent playing Texas Hold'em.

            Assess the current situation and decide what kind of action to take.
            If applicable, also decide the size of bet to make.

            Your current properties are:
            - Chips: ${playerState.stack}
            - Hand: [${formatCards(playerState.holeCards)}]

            Take into account the community cards and the current pot size to make your decision.
            - Community Cards: [${tableState.communityCards}]
            - Current Pot Size: ${totalEligiblePotSize}

            Review the action history and opponent behavior to inform your decision:
            - Action History: [${formatActionHistory(actionHistory)}]

            If there is no entries in the Action History, you are the first player to act in this round,

            The basic strategy behind each type of action is as follows:
            - Fold: If your hand is weak and opponents show strength. Does not require a bet size.
            - Call: If the bet value is reasonable and your hand has potential. Does not require a bet size.
            - Raise: If your hand is strong and you want to increase the pot size or bluff. Requires a bet size.
            - Bet: The same as Raise, but is only available if you have not Bet yet this hand. Requires a bet size.
            - Check: If no bet is required and you want to see the next card for free. Does not require a bet size.

            Based on this information, decide your next move. You may choose one of the following legal actions: [${legalActions.actions.join(", ")}]
            ${legalActions.chipRange ? `If you choose an action that requires a bet size, it must be a minimum of ${legalActions.chipRange.min}  dollars and a maximum of ${legalActions.chipRange.max} dollars.` : ``}

            Make a decision now and provide a brief explanation for your choice.

            Format Instructions:
            The output should be a TypeScript code snippet of an Object that conforms to the following interface:
            interface Output {
                action: 'fold' | 'check' | 'call' | 'bet' | 'raise', // Your chosen action, selected from the legal actions listed above
                betSize?: number // The bet size you have chosen, if your chosen action requires a bet size
            }
        `;
    }

    static async start(runtime: IAgentRuntime) {
        console.log('Starting FXN Client Interface');
        return new FxnClientInterface(runtime);
    }

    async stop() {
        // Cleanup code if needed
        console.log('Stopping direct client');
    }
}
