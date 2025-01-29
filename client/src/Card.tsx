import React from 'react';
import './Card.css';

interface CardProps {
  card: string;       // e.g., "A♠", "10♥"
  faceUp: boolean;    // true if the card is face up
}

const isRedSuit = (suit: string): boolean => {
  return suit === '♥' || suit === '♦';
};

const CardComp: React.FC<CardProps> = ({ card, faceUp }) => {
  // Extract the suit from the card string (last character)
  const suit = card.slice(-1);
  
  // Determine the color based on the suit
  const colorClass = faceUp ? (isRedSuit(suit) ? 'red' : 'black') : '';

  return (
    <div className={`card ${colorClass} ${faceUp ? '' : 'face-down'}`}>
      {faceUp ? card : ''}
    </div>
  );
};

export default CardComp;
