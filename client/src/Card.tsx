// components/CardComp.tsx

import React from 'react';
import './Card.css';
import { getSuitSymbol, isRedSuit } from './utils';

interface Card {
  rank: string;
  suit: string;
}

interface CardProps {
  card: Card,    // e.g., "clubs", "diamonds", "hearts", "spades"
  faceUp: boolean;    // true if the card is face up
}

const CardComp: React.FC<CardProps> = ({ card, faceUp }) => {
  // Get the symbol for the suit

  const suitSymbol = getSuitSymbol(card.suit);

  // Determine the color based on the suit
  const colorClass = faceUp ? (isRedSuit(card.suit) ? 'red' : 'black') : '';

  return (
    <div className={`card ${colorClass} ${faceUp ? '' : 'face-down'}`}>
      {faceUp ? (
        <>
          <span className="card-rank">{card.rank === 'T' ? 10 : card.rank}</span>
          <span className="card-suit">{suitSymbol}</span>
        </>
      ) : (
        <span className="card-back"></span> // Optionally, display a card back design
      )}
    </div>
  );
};

export default CardComp;