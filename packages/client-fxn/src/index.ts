// packages/direct-client/src/index.ts
import express from 'express';
import bodyParser from 'body-parser';
import {IAgentRuntime} from '@ai16z/eliza/src/types.ts';
import { PokerManager } from './pokerManager.ts';
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
    // It will also include just the hole cards that belong to the subscriber
    // If it is the subscriber's turn it will also have the list of actions they can take
    // If the subscriber isn't already in the game they should include one of the emptySeat indices and their buy-in
    // @TODO Add a way for the subscriber to check if they are sat at the table yet, maybe include all sitting public keys
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

                // Send this player's guess back
                res.json({
                    action: "check",
                    betSize: 0
                });

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

    static async start(runtime: IAgentRuntime) {
        console.log('Starting FXN Client');
        return new FxnClientInterface(runtime);
    }

    async stop() {
        // Cleanup code if needed
        console.log('Stopping direct client');
    }
}
