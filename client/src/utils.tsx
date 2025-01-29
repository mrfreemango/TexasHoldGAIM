// utils/suitUtils.ts

export const SUIT_SYMBOLS: { [key: string]: string } = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

/**
 * Maps a suit name to its corresponding symbol.
 * @param suit - The name of the suit (e.g., "clubs")
 * @returns The corresponding suit symbol (e.g., "♣")
 */
export const getSuitSymbol = (suit: string): string => {
  return SUIT_SYMBOLS[suit.toLowerCase()] || suit;
};

/**
 * Determines if a suit is red based on its name.
 * @param suit - The name of the suit (e.g., "hearts")
 * @returns `true` if the suit is red (hearts or diamonds), `false` otherwise.
 */
export const isRedSuit = (suit: string): boolean => {
  const lowerSuit = suit.toLowerCase();
  return lowerSuit === 'hearts' || lowerSuit === 'diamonds';
};