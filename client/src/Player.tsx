import React from "react";
import "./Player.css";
import CardComp from "./Card";

interface Card {
  rank: string;
  suit: string;
}

interface PlayerProps {
  name: string;
  money: number;
  cards: Card[];
  isDealer: boolean;
  isFolded: boolean;
  isWinner: boolean;
  actionOn: string;
  winnings?: number;
}

const PlayerComp: React.FC<PlayerProps> = ({
  name,
  money,
  cards,
  isDealer,
  isFolded,
  isWinner,
  actionOn,
  winnings = 0,
}) => {
  return (
    <div
      className={`player-container ${isFolded ? "folded" : ""} 
        ${isWinner ? "winner" : ""} 
        ${isDealer && !isWinner ? "dealer" : ""}
        ${actionOn === name && !isWinner ? "action" : ""}`}
    >
      {/* Player Name at the top */}
      <div className="player-header">
        <div className="player-name">
          {name.length > 8 ? name.substring(0, 8) : name}
        </div>
      </div>
      {/* Information row with Money and Cards */}
      <div className="player-body">
        <div className="player-info">
          <div className="player-money">
            ${money.toFixed(2)}
            {winnings > 0 && (
              <span className="player-winnings"> (+${winnings.toFixed(2)})</span>
            )}
          </div>
        </div>
        <div className="player-cards">
          {cards.map((card, idx) => (
            <CardComp key={idx} card={card} faceUp={true} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlayerComp;