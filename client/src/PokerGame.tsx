// PokerGame.tsx
import React, { useState, useEffect, useRef } from "react";
import './PokerGame.css';
import CardComp from "./Card";
import PlayerComp from "./Player";

interface Card {
  rank: string;
  suit: string;
}

interface Player {
  id: string;
  name: string;
  money: number;
  cards: Card[]
  isFolded: boolean;
  isDealer: boolean;
  isWinner: boolean;
  avatar: string;
}

interface GameState {
  potSize: number;
  communityCards: Card[];
  players: Player[];
  actionOn: string | null;
  gameState: string; // e.g., 'pre-flop', 'flop', 'turn', 'river', 'dealCards', etc.
}

function PokerGame() {
  const [gameState, setGameState] = useState<GameState>({
    potSize: 0,
    communityCards: [],
    players: [],
    actionOn: null,
    gameState: "pre-flop",
  });

  const [isDealing, setIsDealing] = useState<boolean>(false);
  const [winnerHighlighted, setWinnerHighlighted] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const winnerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /** Fetch game state from the API using fetch */
  const fetchGameState = async () => {
    try {
      const response = await fetch("http://localhost:3008/current-game-state");

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const fetchedGameState: GameState = await response.json();
      setGameState(fetchedGameState);
      setLoading(false);
      setError(null);

      // Handle winner highlighting
      if (fetchedGameState.gameState === "roundEnded") {
        // Clear any existing timeout
        if (winnerTimeoutRef.current) {
          clearTimeout(winnerTimeoutRef.current);
        }
        // Set timeout to remove highlight after 30 seconds
        winnerTimeoutRef.current = setTimeout(() => {
          setWinnerHighlighted(null);
          // Optionally, you can reset the game state here or wait for the next poll
        }, 30000);
      }

      // Handle game state changes
      if (fetchedGameState.gameState === "dealCards" && !isDealing) {
        dealCards();
      }
    } catch (error) {
      console.error("Error fetching game state:", error);
      setError("Failed to fetch game state.");
      setLoading(false);
    }
  };

  /** Initialize polling on component mount */
  useEffect(() => {
    // Initial fetch
    fetchGameState();

    // Set up polling every 10 seconds
    pollingIntervalRef.current = setInterval(fetchGameState, 10000);

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (winnerTimeoutRef.current) {
        clearTimeout(winnerTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Deal cards based on the game state */
  const dealCards = () => {
    setIsDealing(true);
    // Implement any client-side dealing animations or UI updates here
    // For example, you might animate the dealing of community cards one by one

    // Example: Simulate dealing community cards with delays
    const dealSequence = async () => {
      for (let i = 0; i < gameState.communityCards.length; i++) {
        // Here, you might trigger animations or update local state for each card
        // Since the server manages the game state, ensure that the UI reflects the fetched state
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second between each card
      }
      setIsDealing(false);
    };

    dealSequence();
  };

  /** Render Players */
  const renderPlayers = () => {
    return gameState.players.map((player, index) => (
      <div
        key={player.id}
        className={`player-spot player-${index + 1} ${
          player.isDealer ? "dealer" : ""
        } ${player.isFolded ? "folded" : ""} ${
          winnerHighlighted === player.id ? "winner-highlight" : ""
        }`}
      >
        <PlayerComp
          name={player.name}
          avatar={player.avatar}
          money={player.money}
          cards={player.cards}
          isFolded={player.isFolded}
          isDealer={player.isDealer}
          isWinner={player.isWinner}
        />
      </div>
    ));
  };

  /** Render Community Cards */
  const renderCommunityCards = () => {
    return gameState.communityCards.map((card, idx) => (
      <CardComp key={idx} card={`${card.rank}${card.suit}`} faceUp={true} />
    ));
  };

  if (loading) {
    return <div className="loading">Loading game state...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="poker-game-container">
      <div className="game-info">
        <div className="pot-size">Pot Size: ${gameState.potSize}</div>
        {gameState.actionOn && (
          <div className="action-on">
            Action on: {gameState.players.find(p => p.id === gameState.actionOn)?.name || gameState.actionOn}
          </div>
        )}
      </div>
      <div className="table-container">
        <div className="table">
          {/* Players */}
          {renderPlayers()}

          {/* Communal Cards */}
          <div className="communal-cards-container">
            <div className="communal-cards">
              {renderCommunityCards()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PokerGame;
