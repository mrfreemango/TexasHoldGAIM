import React from "react";
import "./Player.css";
import CardComp from "./Card";

interface Card {
  rank: string;
  suit: string;
}

interface PlayerProps {
  name: string;
  avatar: string; // URL or placeholder for the avatar image
  money: number;
  cards: Card[];
  isDealer: boolean;
  isFolded: boolean;
  isWinner: boolean;
}

const PlayerComp: React.FC<PlayerProps> = ({ name, avatar, money, cards, isDealer, isFolded, isWinner }) => {
  const isMobile = window.innerWidth <= 768; // Detect mobile devices

  return (
    <div className={`player-container ${isFolded ? "folded" : ""} ${isWinner ? "winner": ""}`}>
      <div className="player-top-row">
        {!isMobile && (
          <div className="player-avatar">
            <img src={`${avatar ? avatar : "default_avatar.png"}`} alt={`${name}'s avatar`} />
          </div>
        )}
        <div className="player-cards">
          {cards.map((card, idx) => (
            <CardComp key={idx} card={card} faceUp={true} />
          ))}
        </div>
      </div>
      <div className="player-bottom-row">
        <div className="player-name">{isDealer && <span>(D) </span>}{name.length > 8 ? name.substring(0, 8): name}</div>
        <div className="player-money">${money.toFixed(2)}</div>
      </div>
    </div>
  );
};

export default PlayerComp;