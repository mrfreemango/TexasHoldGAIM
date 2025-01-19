import {FxnClient} from "./fxnClient.ts";
import {Table} from "poker-ts";
import Poker, { Action, Card } from "poker-ts/dist/facade/poker";
import ChipRange from "poker-ts/dist/lib/chip-range";

declare type SeatIndex = number;
declare type PublicKey = string;
declare type BetSize = number;
declare type ActionHistoryEntry = [SeatIndex, Action, BetSize];
declare type ActionHistory = Array<ActionHistoryEntry>;

interface Player {
    totalChips: number;
    stack: number;
    betSize: BetSize;
}

interface ForcedBets {
    ante: BetSize,
    bigBlind: BetSize,
    smallBlind: BetSize
}

interface ActionRange {
    actions: Action[],
    chipRange?: ChipRange
}

// Stuff that everyone at the table can know
interface TableState {
    players: Array<Player>,
    emptySeats: Array<SeatIndex>,
    forcedBets: ForcedBets,
    numSeats: number,
    isHandInProgress: boolean,
    playerToActSeat: SeatIndex,
    button: SeatIndex,
    isBettingRoundInProgress: boolean,
    areBettingRoundsCompleted: boolean,
    roundOfBetting: string,
    communityCards: Array<Card>
}

// Stuff that should be kept secret from other players
interface PlayerState {
    legalActions: ActionRange,
    holeCards: [Card, Card]
}

const ANTE: BetSize = 0;
const BIG_BLIND: BetSize = 10;
const SMALL_BLIND: BetSize = 5;
const MAX_PLAYERS: number = 9; // Max of 23 set by poker-ts

export class PokerManager {
    private table: Poker
    private tableState: TableState;
    private actionHistory: ActionHistory;
    private playerKeys: Map<SeatIndex, PublicKey>;
    private playerSeats: Map<PublicKey, SeatIndex>;
    private readonly TABLE_EMPTY_DELAY: number = 30 * 1000; // 30s delay
    private tableEmptyTimer: NodeJS.Timeout | null = null;

    constructor(private fxnClient: FxnClient) {
        this.table = new Table({ante: ANTE, bigBlind: BIG_BLIND, smallBlind: SMALL_BLIND}, MAX_PLAYERS);
        this.startNewGame();
    }

    private async startNewGame(): Promise<void> {
        console.log("Trying to start a new game.");
        this.actionHistory = new Array<[SeatIndex, Action, BetSize]>();
        this.tableState.emptySeats = this.getEmptySeats();

        if (this.tableState.emptySeats.length > 0) {
            // We have empty seats, broadcast them to subscribers

            // @TODO POST
            // response: {chosenSeat: SeatIndex, buyIn: number}
            // this.addPlayer(publicKey, chosenSeat, buyIn)
        }

        if (this.getFilledSeats.length < 2) {
            // There are less than 2 players at the table, check again in X seconds
            if (this.tableEmptyTimer) {
                clearTimeout(this.tableEmptyTimer);
            }

            console.log("Not enough players, trying again in " + this.TABLE_EMPTY_DELAY + " seconds.");
            this.tableEmptyTimer = setTimeout(() => this.startNewGame(), this.TABLE_EMPTY_DELAY);
        }
        else
        {
            // We have at least 2 players and can start the game
            console.log("Starting the game.");
            await this.startNewHand();
        }
    }

    private async startNewHand(): Promise<void> {
        console.log("Starting new hand.");
        this.table.startHand();

        await this.BroadcastRound();
    }

    private async BroadcastRound(): Promise<void> {
        const playerToActSeat: SeatIndex = this.table.playerToAct();
        const playerToActKey: PublicKey = this.playerKeys.get(playerToActSeat);
        this.updateTableState();

        const subscribers = await this.fxnClient.getSubscribers();

        // Broadcast to all subscribers
        const promises = subscribers.map(async (subscriberDetails) => {
            try {
                const publicKey = subscriberDetails.subscriber.toString();
                const seatIndex = this.playerSeats.get(publicKey);
                const recipient = subscriberDetails.subscription?.recipient;
                const playerState = this.getPlayerState(publicKey);

                // Only broadcast if the subscriber is active
                if (recipient && subscriberDetails.status === 'active') {
                    console.log("Broadcasting to " + recipient + " with state " + playerState);

                    const response = await this.fxnClient.broadcastToSubscriber({
                        tableState: this.tableState,
                        playerState: playerState,
                        actionHistory: this.actionHistory
                    }, subscriberDetails);

                    console.log("Response: " + response);

                    // Player to act response should include an action
                    if (publicKey == playerToActKey && response && response.ok) {
                        const responseData = await response.json();
                        const action = responseData.action;
                        const betSize = responseData.betSize;

                        console.log("Seat: " + seatIndex + " Action: " + action + " Bet: " + betSize);
                        this.table.actionTaken(action, betSize ? betSize : null);

                        this.actionHistory.push([seatIndex, action, betSize]);
                    }
                }
            } catch (error) {
                console.error(`Error communicating with subscriber:`, error);
            }
        });

        await Promise.all(promises);
    }

    private getPlayerState(publicKey: PublicKey): PlayerState {
        const seatIndex = this.playerSeats.get(publicKey)
        return {
            legalActions: this.tableState.isBettingRoundInProgress ? this.table.legalActions() : null,
            holeCards: this.table.holeCards[seatIndex]
        }
    }

    private updateTableState() {
        // Can get these any time
        this.tableState.players = this.table.seats();
        this.tableState.numSeats = this.table.numSeats();
        this.tableState.emptySeats = this.getEmptySeats();
        this.tableState.forcedBets = this.table.forcedBets();

        // We can only get these when the hand is in progress
        const handinProgress = this.table.isHandInProgress();
        this.tableState.isHandInProgress = handinProgress;

        this.tableState.playerToActSeat = handinProgress ? this.table.playerToAct() : null;
        this.tableState.button = handinProgress ? this.table.button() : null;
        this.tableState.isBettingRoundInProgress = handinProgress ? this.table.isBettingRoundInProgress() : null;
        this.tableState.areBettingRoundsCompleted = handinProgress ? this.table.areBettingRoundsCompleted() : null;
        this.tableState.roundOfBetting = handinProgress ? this.table.roundOfBetting() : null;
        this.tableState.communityCards = handinProgress ? this.table.communityCards() : null;

        console.log("Table state: " + this.tableState);
    }

    private addPlayer(publicKey: PublicKey, seatIndex: SeatIndex, buyIn: number)
    {
        console.log("Adding player with key " + publicKey + " to seat " + seatIndex + " with " + buyIn + " chips.");
        this.table.sitDown(seatIndex, buyIn);
        this.playerKeys.set(seatIndex, publicKey);
        this.playerSeats.set(publicKey, seatIndex);
    }

    private getEmptySeats(): number[] {
        let emptySeats = new Array<number>();
        this.table.seats().forEach((seat, index) => {
            if (seat == null)
                emptySeats.push(index);
        });
        console.log("Empty seats: " + emptySeats);
        return emptySeats;
    }

    private getFilledSeats(): number[] {
        let filledSeats = new Array<number>();
        this.table.seats().forEach((seat, index) => {
            if (seat != null)
                filledSeats.push(index);
        });
        console.log("Filled seats: " + filledSeats);
        return filledSeats;
    }
}