import type { MatchState } from '../../engine/match';
import { Board } from './Board';

export interface BoardGridProps {
  readonly state: MatchState;
  /** Forwarded to every Board — see Board's own doc comment on shakeToken. */
  readonly shakeToken?: number;
}

/**
 * Lays out however many boards `state` carries — 1 for Solo, 2 for Dueto, 4
 * for Quarteto — entirely off `state.boards.length`. No variant name ever
 * appears in this file: a fourth variant with, say, 3 boards would fall
 * through the same `boardCount` branches below without this component
 * changing at all.
 *
 * THE SMALL-SCREEN STRATEGY (decided once, here, rather than re-litigated
 * per variant):
 *
 * - Solo (1 board) is untouched: the original single centered column,
 *   capped at `max-w-sm` (24rem), exactly as it always was.
 * - Dueto (2 boards) stacks in one column below the `sm:` breakpoint and
 *   goes side by side from `sm:` up — "wide" and "narrow" are a CSS
 *   breakpoint, not a clamp: two boards of 7 rows each is a HEIGHT problem
 *   on a narrow phone, not a width one, and Shell.tsx's scrolling board
 *   area already answers that (see its own doc comment).
 * - Quarteto (any boardCount > 2 today, always 4) is a fixed 2x2 grid at
 *   EVERY width — it never collapses to one column, because a single
 *   column of four 9-row boards would be far taller than stacking them 2x2
 *   ever is. This is the one case that is a genuine width problem too: two
 *   44px-ish tiles' worth of board have to fit side by side inside an
 *   iPhone SE's ~320px. `.grade-compacta` (index.css) answers that half —
 *   it overrides `--text-tile` to a smaller `clamp()` on this subtree only,
 *   the same "override a token on an ancestor" trick tokens.css already
 *   uses at :root for the light/dark swap, just scoped here instead of the
 *   whole page. `compact` (passed to every Board below) answers the other
 *   half, tightening `gap-2` to `gap-1` between tiles and between rows.
 *   Tile.tsx and Row.tsx's own grid-cols-5 (fr-based) tracks do the rest:
 *   nothing here hard-codes a tile's pixel size, only the ceiling on how
 *   big the glyph and the gaps around it are allowed to get.
 */
export function BoardGrid({ state, shakeToken = 0 }: BoardGridProps) {
  const boardCount = state.boards.length;
  const compact = boardCount > 2;

  const containerClass =
    boardCount <= 1
      ? 'flex w-full max-w-sm flex-col items-center'
      : boardCount === 2
        ? 'grid w-full max-w-sm grid-cols-1 gap-4 sm:max-w-3xl sm:grid-cols-2 sm:gap-6'
        : 'grade-compacta grid w-full max-w-md grid-cols-2 gap-3';

  return (
    <div className={containerClass}>
      {state.boards.map((_board, index) => (
        <Board key={index} state={state} boardIndex={index} shakeToken={shakeToken} compact={compact} />
      ))}
    </div>
  );
}
