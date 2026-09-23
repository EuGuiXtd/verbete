import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { scoreGuess } from '../score';
import type { Tile } from '../types';

const SYMBOL: Record<Tile, string> = { correct: 'C', present: 'P', absent: '-' };
const render = (tiles: readonly Tile[]): string => tiles.map((t) => SYMBOL[t]).join('');

describe('scoreGuess', () => {
  it.each([
    ['CASAL', 'CASAL', 'CCCCC'],
    ['ARARA', 'TERRA', '-P-CC'],
    ['TERRA', 'ARARA', '--PCC'],
    // The decisive case: three R in the guess, two in the answer.
    // A single-pass implementation marks all three.
    ['ERRAR', 'TERRA', 'PPCP-'],
    ['MORRO', 'TERRA', '--CC-'],
    ['NANAR', 'ANNAS', 'PPCC-'],
  ])('%s against %s scores %s', (guess, answer, expected) => {
    expect(render(scoreGuess(guess, answer))).toBe(expected);
  });

  it('never credits a letter more times than the answer contains it', () => {
    const word = fc.stringMatching(/^[A-Z]{5}$/);
    fc.assert(
      fc.property(word, word, (guess, answer) => {
        const tiles = scoreGuess(guess, answer);
        for (const letter of new Set(guess)) {
          const credited = [...guess].filter(
            (c, i) => c === letter && tiles[i] !== 'absent',
          ).length;
          const available = [...answer].filter((c) => c === letter).length;
          expect(credited).toBeLessThanOrEqual(available);
        }
      }),
    );
  });
});
