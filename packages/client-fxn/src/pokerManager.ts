import { FxnClient } from "./fxnClient.ts";
import Table from "./poker-ts-main/src/lib/table.ts";
import Action, { ActionRange }  from "./poker-ts-main/src/lib/dealer.ts";
import Hand from "./poker-ts-main/src/lib/hand.ts";
import Card from "./poker-ts-main/src/lib/card.ts";
import CommunityCards, { RoundOfBetting } from "./poker-ts-main/src/lib/community-cards.ts";

declare type SeatIndex = number;
declare type HoleCards = [Card, Card];
declare type PublicKey = string;
declare type BetSize = number | null;
declare type ActionHistoryEntry = [RoundOfBetting, SeatIndex, Action, BetSize];
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
    roundOfBetting: RoundOfBetting,
    communityCards: CommunityCards,
    winners: [SeatIndex, Hand, HoleCards][][]
}

// Stuff that should be kept secret from other players
interface PlayerState {
    legalActions: ActionRange,
    holeCards: HoleCards
}

const ANTE: BetSize = 0;
const BIG_BLIND: BetSize = 10;
const SMALL_BLIND: BetSize = 5;
const MAX_PLAYERS: number = 9; // Max of 23 set by poker-ts

export class PokerManager {
    private table: Table
    private tableState: TableState;
    private actionHistory: ActionHistory;
    private playerKeys: Map<SeatIndex, PublicKey>;
    private playerSeats: Map<PublicKey, SeatIndex>;
    public readonly TABLE_EMPTY_DELAY: number = 10 * 1000; // 30s delay
    public readonly NEW_HAND_DELAY: number = 30 * 1000; // 30s delay
    private tableEmptyTimer: NodeJS.Timeout | null = null;

    constructor(private fxnClient: FxnClient) {
        this.table = new Table({ante: ANTE, bigBlind: BIG_BLIND, smallBlind: SMALL_BLIND}, MAX_PLAYERS);
        this.startNewGame();
    }

    private async startNewGame(): Promise<void> {
        console.log("Starting a new game.");
        this.actionHistory = new Array<[RoundOfBetting, SeatIndex, Action, BetSize]>();
        this.tableState.emptySeats = this.getEmptySeats();

        if (this.tableState.emptySeats.length > 0) {
            // We have empty seats, seat any subscribers
            
            const subscribers = await this.fxnClient.getHostSubscribers();
            subscribers.forEach((subscriberDetails) => {
                const publicKey = subscriberDetails.subscriber.toString();
                if (!this.playerSeats.get(publicKey)) {
                    const seatIndex = this.getEmptySeats().pop();
                    const buyIn = 300;
                    this.addPlayer(publicKey, seatIndex, buyIn);
                    console.log(`Seated ${publicKey} at chair ${seatIndex} with ${buyIn} chips.`);
                }
            });
        }

        if (this.getFilledSeats().length < 2) {
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
            this.startNewHand();
        }
    }

    private async startNewHand(): Promise<void> {
        console.log("Starting new hand.");
        this.table.startHand();
        this.updateTableState();

        this.BroadcastHand();
    }

    private async BroadcastHand(): Promise<void> {
        while (this.tableState.isHandInProgress) {
            while (this.tableState.isBettingRoundInProgress) {
                await this.BroadcastBettingRound();
                this.updateTableState();
            }

            console.log("Betting round over.");
            this.table.endBettingRound();
            this.updateTableState();

            if (this.tableState.areBettingRoundsCompleted) {
                await this.BroadcastShowdown();
            }
        }

        console.log("Hand over! Starting next hand in 30s.");
        setTimeout(this.startNewHand, this.NEW_HAND_DELAY);
    }

    private async BroadcastBettingRound() {
        console.log("Starting betting round: " + this.tableState.roundOfBetting);

        const playerToActSeat: SeatIndex = this.table.playerToAct();
        const playerToActKey: PublicKey = this.playerKeys.get(playerToActSeat);

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

                    if (publicKey == playerToActKey) {
                        // It is this player's turn
                        
                        // Await their response
                        const response = await this.fxnClient.broadcastToSubscriber({
                            tableState: this.tableState,
                            playerState: playerState,
                            actionHistory: this.actionHistory
                        }, subscriberDetails);
                        console.log("Response: " + response);

                        // Parse their chosen action
                        const responseData = await response.json();
                        const action = responseData.action;
                        const betSize = responseData.betSize;

                        // TODO: Validate

                        // Send the action to the table
                        console.log("Seat: " + seatIndex + " Action: " + action + " Bet: " + betSize);
                        this.table.actionTaken(action, betSize ? betSize : null);

                        // Add it to the history
                        const bettingRound = this.tableState.roundOfBetting;
                        this.actionHistory.push([bettingRound, seatIndex, action, betSize]);

                        return response;
                    } else {
                        // It is not this player's turn

                        // Give them their update async
                        return this.fxnClient.broadcastToSubscriber({
                            tableState: this.tableState,
                            playerState: playerState,
                            actionHistory: this.actionHistory
                        }, subscriberDetails);
                    }
                }
            } catch (error) {
                console.error(`Error communicating with subscriber:`, error);
            }
        });

        await Promise.all(promises);
    }

    private async BroadcastShowdown() {
        console.log("Starting showdown.");

        // If there is only one pot with one eligible player, they won't show up in winners() so add them here
        const pots = this.table.pots();
        if (pots.length == 1 && pots[0].eligiblePlayers.length == 1) {
            const winnerSeatIndex = pots[0].eligiblePlayers[0];
            const winnerHoleCards: Card[] = this.table.holeCards[winnerSeatIndex];
            const communityCards = this.table.communityCards();
            const winnerHand = Hand.create(winnerHoleCards, communityCards);
            this.tableState.winners.push([winnerSeatIndex, { 
                cards: winnerHoleCards,
                ranking: winnerHand.ranking,
                strength: winnerHand.strength
            }, communityCards.cards()])
        }

        this.table.showdown();
        
        if (this.table.winners().length != 0) {
            this.tableState.winners = this.table.winners();
        }
        this.updateTableState();

        const subscribers = await this.fxnClient.getSubscribers();

        // Broadcast to all subscribers
        const promises = subscribers.map(async (subscriberDetails) => {
            try {
                const publicKey = subscriberDetails.subscriber.toString();
                const recipient = subscriberDetails.subscription?.recipient;
                const playerState = this.getPlayerState(publicKey);

                // Only broadcast if the subscriber is active
                if (recipient && subscriberDetails.status === 'active') {
                    return this.fxnClient.broadcastToSubscriber({
                        tableState: this.tableState,
                        playerState: playerState,
                        actionHistory: this.actionHistory
                    }, subscriberDetails);
                }
            } catch (error) {
                console.error(`Error communicating with subscriber:`, error);
            }
        });

        return Promise.all(promises);
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
        const handinProgress = this.table.handInProgress();
        this.tableState.isHandInProgress = handinProgress;

        this.tableState.playerToActSeat = handinProgress ? this.table.playerToAct() : null;
        this.tableState.button = handinProgress ? this.table.button() : null;
        this.tableState.isBettingRoundInProgress = handinProgress ? this.table.bettingRoundInProgress() : null;
        this.tableState.roundOfBetting = handinProgress ? this.table.roundOfBetting() : null;
        this.tableState.communityCards = handinProgress ? this.table.communityCards() : null;
        
        const bettingRoundsCompleted = handinProgress ? this.table.bettingRoundsCompleted() : null;
        this.tableState.areBettingRoundsCompleted = bettingRoundsCompleted;
        
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