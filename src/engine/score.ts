import type { Tile } from './types';

/**
 * Two passes, and the order matters. Pass one claims exact positions and
 * counts what the answer has left over. Pass two spends that budget on
 * misplaced letters, left to right. Doing it in one pass over-credits
 * repeated letters: ERRAR against TERRA would mark all three R.
 *
 * Both arguments must already be normalized and the same length.
 */
export function scoreGuess(guess: string, answer: string): readonly Tile[] {
  const size = guess.length;
  const tiles: Tile[] = new Array<Tile>(size).fill('absent');
  const unmatched = new Map<string, number>();

  for (let i = 0; i < size; i += 1) {
    const letter = guess[i]!;
    const target = answer[i]!;
    if (letter === target) {
      tiles[i] = 'correct';
    } else {
      unmatched.set(target, (unmatched.get(target) ?? 0) + 1);
    }
  }

  for (let i = 0; i < size; i += 1) {
    if (tiles[i] === 'correct') continue;
    const letter = guess[i]!;
    const available = unmatched.get(letter) ?? 0;
    if (available > 0) {
      tiles[i] = 'present';
      unmatched.set(letter, available - 1);
    }
  }

  return tiles;
}
