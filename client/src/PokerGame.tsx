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

enum GameStage {
  PreFlop = 'preflop',
  Flop = 'flop',
  Turn = 'turn',
  River = 'river',
  Showdown = 'Showdown',
  BetweenHands = 'Between Hands'
}

// Update the GameState interface to use the GameStage enum
interface GameState {
  potSize: number[];
  communityCards: Card[];
  players: Player[];
  actionOn: string | null;
  gameState: GameStage; // Now strongly typed using the GameStage enum
}

function PokerGame() {
  const [gameState, setGameState] = useState<GameState>({
    potSize: [],
    communityCards: [],
    players: [],
    actionOn: null,
    gameState: GameStage.PreFlop,
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
      const response = await fetch("/api/current-game-state");

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const fetchedGameState: GameState = await response.json();
      console.log(fetchedGameState)
      fetchedGameState.players = fetchedGameState.players.filter((player): player is Player => player !== null)
      setGameState(fetchedGameState);
      setLoading(false);
      setError(null);

      // Handle winner highlighting
      if (fetchedGameState.gameState === GameStage.BetweenHands) {
        // Clear any existing timeout
        if (winnerTimeoutRef.current) {
          clearTimeout(winnerTimeoutRef.current);
        }
        // Set timeout to remove highlight after 30 seconds
        winnerTimeoutRef.current = setTimeout(() => {
          setWinnerHighlighted(null);
          // Optionally, you can reset the game state here or wait for the next poll
        }, 10000);
      }

    } catch (error) {
      console.error("Error fetching game state:", error);
      setError("Failed to fetch game state.");
      setLoading(false);
    }
  };

  /** Initialize polling on component mount */
  useEffect(() => {
    fetchGameState();

    // Set up polling every 10 seconds
    pollingIntervalRef.current = setInterval(fetchGameState, 5000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (winnerTimeoutRef.current) {
        clearTimeout(winnerTimeoutRef.current);
      }
    };
  }, []);

  /** Render Players */
  const renderPlayers = () => {
    return gameState.players
      .filter((player): player is Player => player !== null) // TypeScript type guard
      .map((player, index) => (
        <div
          key={player.id}
          className={`player-spot player-${index + 1} ${
            player.isDealer ? "dealer" : ""
          } ${player.isFolded ? "folded" : ""} ${
            winnerHighlighted === player.id ? "winner-highlight" : ""
          }`}
        >
          <PlayerComp
            name={player.id}
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
      <CardComp key={idx} card={card} faceUp={true} />
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
        {/* Pot Sizes Section */}
        <div className="pot-sizes-section">
            {gameState.potSize !== null && Array.isArray(gameState.potSize) && gameState.potSize.length > 1 ? (
              // If there are multiple pot sizes, display them in a list
              <div>
                <strong>Pot Sizes:</strong>
                <ul className="pot-sizes-list">
                  {gameState.potSize.map((pot, index) => (
                    <li key={index} className="pot-size">
                      ${pot}
                    </li>
                  ))}
                </ul>
              </div>
            ) : gameState.potSize.length === 1 ? (
              // If there's only one pot size, display it normally
              <div>
                <strong>Pot Size: <span className="pot-size">${gameState.potSize[0]}</span></strong>
              </div>
            ) : (
              // Optional: Handle cases where potSize.length === 0
              <div>
                <strong>Pot Size: <span className="pot-size">0</span></strong>
              </div>
            )}
          </div>

          {/* Action On Section */}
          <div className="action-on-section">
              <div className="action-on">
                <strong>Action on: <span>{ gameState.actionOn.length > 8 ? gameState.actionOn.substring(0, 8) : gameState.actionOn }</span></strong>
              </div>
          </div>
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
