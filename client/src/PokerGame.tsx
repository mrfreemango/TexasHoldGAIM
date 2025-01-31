// PokerGame.tsx
import React, { useState, useEffect, useRef } from "react";
import './PokerGame.css';
import CardComp from "./Card";
import PlayerComp from "./Player";
import './Player.css'

// types.ts or within PokerGame.tsx

interface Card {
  rank: string;
  suit: string;
}

interface Player {
  id: string;
  name: string;
  money: number;
  cards: Card[];
  isFolded: boolean;
  isDealer: boolean;
  isWinner: boolean;
  // avatar: string; // Removed as per requirement
}

interface ActionLog {
  player: string;
  action: string;
  betSize: number;
}

enum GameStage {
  PreFlop = 'preflop',
  Flop = 'flop',
  Turn = 'turn',
  River = 'river',
  Showdown = 'Showdown',
  BetweenHands = 'Between Hands'
}

interface GameState {
  potSize: number[];
  communityCards: Card[];
  players: (Player | null)[]; // Array of 8 Player or null
  actionOn: string | null;
  gameState: GameStage;
  actionLog: ActionLog[];
}

interface Winner {
  name: string;
  holeCards: Card[]; 
  handRanking: string; 
  winnings: number;
}
// ... (interfaces and enums as defined above)

function PokerGame() {
  const [gameState, setGameState] = useState<GameState>({
    potSize: [100, 200],
    communityCards: [],
    players: [
      {
        id: "2JEj9HLqGuMuviAahjuRTEqLwqKK1bXLaPppPxYW5iUb",
        name: "Player 1",
        money: 295,
        cards: [
          { rank: "T", suit: "clubs" },
          { rank: "4", suit: "hearts" },
        ],
        isFolded: false,
        isDealer: true,
        isWinner: false,
        // avatar: "", // Removed
      },
      {
        id: "8KSsgLoYLSMg21TRb1t7HuJEodTPFC52AZBU8GsHhFMM",
        name: "Player 2",
        money: 290,
        cards: [
          { rank: "6", suit: "clubs" },
          { rank: "5", suit: "diamonds" },
        ],
        isFolded: false,
        isDealer: false,
        isWinner: false,
        // avatar: "", // Removed
      },
      // Add more players or leave empty seats as null
    ],
    actionOn: "Player 2",
    gameState: GameStage.PreFlop,
    actionLog: [{
        player: 'Player 1',
        action: 'bet', 
        betSize: 50
      },
    ],
  });

  const [winnerInfo, setWinnerInfo] = useState<Winner | null>(null)
  const [isDealing, setIsDealing] = useState<boolean>(false);
  const [winnerHighlighted, setWinnerHighlighted] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const winnerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Since you're not polling, you can remove the fetchGameState and useEffect

  /** Initialize players array to have exactly 8 seats */
  useEffect(() => {
    setGameState(prevState => {
      const playersWithNulls = [...prevState.players];
      while (playersWithNulls.length < 8) {
        playersWithNulls.push(null);
      }
      return { ...prevState, players: playersWithNulls };
    });
  }, []);

  /** Render Players */
  const renderPlayers = () => {
    return gameState.players.map((player, index) => {
      if (player) {
        return (
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
              money={player.money}
              cards={player.cards}
              isFolded={player.isFolded}
              isDealer={player.isDealer}
              isWinner={player.isWinner}
            />
          </div>
        );
      } else {
        return (
           <div key={`empty-${index}`} className={`player-spot empty-seat player-${index + 1}`}>
              <div className='player-container'>
              Join the Game Now:
                <br/>
                <br/>
              Link to Quick Start Guides
              </div>
            </div>
        );
      }
    });
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
      <div className="sidebar">
        <img
            src="https://fxn-static.s3.us-west-1.amazonaws.com/FXN_Logo-White.png"
            alt="FXN Logo"
            className="fxn-logo"
        />
        <div className="pot-size">
          <div className="pot-sizes-section">
            {Array.isArray(gameState.potSize) && gameState.potSize.length > 1 ? (
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
        </div>
        <div className="action-on-section">
          <div className="action-on">
            <strong>Game Phase: <span>{ gameState.gameState }</span></strong>
          </div>
        </div>
        <div className="action-on-section">
          <div className="action-on">
            <strong>Action on: <span>{ gameState.actionOn?.length > 8 ? gameState.actionOn.substring(0, 8) : gameState.actionOn }</span></strong>
          </div>
        </div>
        <div className="action-log">
          {gameState.actionLog.map((action, index) => (
            <div key={index} className="action-log-item">
              <span className="action-player">{action.player}: </span>
                <span className="action-text">{action.action.toUpperCase()}
                { action.action === 'bet' && <span className="action-bet"> ${action.betSize}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="main-content">
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
    </div>
  );
}

export default PokerGame;
