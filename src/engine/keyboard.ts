import { boardRows } from './match';
import type { MatchState } from './match';
import type { Tile } from './types';

export type KeyState = Tile | 'unused';

/** No cedilla and no accented keys: input is A-Z, diacritics are never hints. */
export const KEY_ROWS: readonly (readonly string[])[] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

const RANK: Record<KeyState, number> = { unused: 0, absent: 1, present: 2, correct: 3 };

export function keyboardStates(state: MatchState): ReadonlyMap<string, readonly KeyState[]> {
  const boardCount = state.boards.length;
  const result = new Map<string, KeyState[]>();
  for (const letter of KEY_ROWS.flat()) {
    result.set(letter, new Array<KeyState>(boardCount).fill('unused'));
  }

  for (let boardIndex = 0; boardIndex < boardCount; boardIndex += 1) {
    for (const row of boardRows(state, boardIndex)) {
      row.tiles.forEach((tile, position) => {
        const letter = row.guess[position]!;
        const states = result.get(letter);
        if (!states) return;
        // Monotonic: a letter only ever climbs. Otherwise a later guess in a
        // different position would demote a confirmed green back to grey.
        if (RANK[tile] > RANK[states[boardIndex]!]) states[boardIndex] = tile;
      });
    }
  }

  return result;
}
