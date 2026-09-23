import { MODE_LABEL, VARIANT_LABEL, WORD_LENGTH } from './constants';
import { dailyNumber } from './daily';
import { boardRows } from './match';
import type { MatchState } from './match';
import type { Tile } from './types';

export interface ShareOptions {
  readonly url: string;
}

// Ink-on-paper, to match the board: full ink, red ink, bare paper.
const GLYPH: Record<Tile, string> = { correct: '⬛', present: '🟥', absent: '⬜' };
const BLANK = '　'; // ideographic space: same advance width as an emoji

export function renderShare(state: MatchState, options: ShareOptions): string {
  const score = state.status === 'won' ? `${state.guesses.length}/${state.maxAttempts}` : `X/${state.maxAttempts}`;
  const title = state.dayKey
    ? `Verbete ${VARIANT_LABEL[state.variant]} #${dailyNumber(state.dayKey)} — ${score}`
    // MODE_LABEL, not a second lowercase copy of the word: the tab the
    // player pressed says "Infinito", capitalised like Solo/Dueto/Quarteto
    // beside it.
    : `Verbete ${VARIANT_LABEL[state.variant]} (${MODE_LABEL.infinito}) — ${score}`;

  const lines: string[] = [title, ''];

  for (let guessIndex = 0; guessIndex < state.guesses.length; guessIndex += 1) {
    const segments = state.boards.map((_board, boardIndex) => {
      const rows = boardRows(state, boardIndex);
      const row = rows[guessIndex];
      // A board solved earlier produces no row here; emit blanks so the
      // columns of a dueto/quarteto grid stay aligned.
      if (!row) return BLANK.repeat(WORD_LENGTH);
      return row.tiles.map((tile) => GLYPH[tile]).join('');
    });
    lines.push(segments.join(' '));
  }

  lines.push('', options.url);
  return lines.join('\n');
}
