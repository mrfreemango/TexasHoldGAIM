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
}

const PlayerComp: React.FC<PlayerProps> = ({ name, money, cards, isDealer, isFolded, isWinner }) => {
  return (
    <div className={
          `player-container ${isFolded ? "folded" : ""} 
          ${isWinner ? "winner": ""} 
          ${isDealer ? "dealer": ""}`
      }>
      <div className="player-top-row">
        <div className="player-cards">
          {cards.map((card, idx) => (
            <CardComp key={idx} card={card} faceUp={true} />
          ))}
        </div>
      </div>
      <div className="player-bottom-row">
        <div className="player-name">{name.length > 8 ? name.substring(0, 8): name}</div>
        <div className="player-money">${money.toFixed(2)}</div>
      </div>
    </div>
  );
};

export default PlayerComp;