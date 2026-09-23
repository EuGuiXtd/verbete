import type { MatchState } from '../../engine/match';
import { Board } from './Board';

export interface BoardGridProps {
  readonly state: MatchState;
  /** Forwarded to every Board — see Board's own doc comment on shakeToken. */
  readonly shakeToken?: number;
  /**
   * Forwarded to every Board, which narrows it to its own active row — see
   * Board's own doc comment. One handler for all of them on purpose: Dueto
   * and Quarteto share a single draft and therefore a single insertion
   * point, so tapping the third house on ANY board moves the same cursor,
   * which is the same thing typing a letter has always done.
   */
  readonly onSelectCell?: (index: number) => void;
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
 * - Dueto (2 boards) is side by side at EVERY width. Feedback round 1,
 *   item 2: it used to stack below the `sm:` breakpoint, on the reasoning
 *   that two 7-row boards are a HEIGHT problem rather than a width one and
 *   that Shell's scrolling board area answers height for free. That
 *   reasoning is wrong about what a player actually sees. The name of the
 *   variant is the promise that two words are in play at once, and a
 *   stacked pair reads as one board with another somewhere below the fold —
 *   the owner reported it as a bug ("os tabuleiros aparecem na vertical"),
 *   not as a layout preference. Nothing about the width was ever
 *   impossible: two boards of five `fr`-sized tiles fit 320px the same way
 *   Quarteto's own two columns already do, which is why the fix is the same
 *   pair of dials Quarteto uses — `.grade-dupla` (index.css) caps the glyph
 *   for a board that now owns half the width instead of all of it, and
 *   Row/Board's gaps tighten below `sm:`. Measured at 320px: a Dueto tile
 *   lands at ~25px a side, against the ~21px Quarteto has shipped at the
 *   same width since Task 23.
 * - Quarteto (any boardCount > 2 today, always 4) never collapses to one
 *   column, because a single column of four 9-row boards would be far
 *   taller than stacking them ever is. Two across below `lg:`, four across
 *   from `lg:` up — feedback round 1, item 8: the 2x2 was fixed at every
 *   width, so a desktop player got a tall block that ran past the bottom of
 *   the board area, with ~500px of empty screen either side of it, and had
 *   to scroll to see boards 3 and 4 at all. Four across turns that into one
 *   glance. This is the one case that is a genuine width problem too: two
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
 *
 * `items-start` (Task 25, carried from Task 23's review): CSS Grid's default
 * `align-items: stretch` was silently inflating every solved board's own box
 * to match its still-playing row-mate's full height — proven by measuring
 * `getBoundingClientRect()` on a real Quarteto render: a board frozen after
 * one guess measured the SAME height (301px) as its nine-row neighbour,
 * purely from an invisible stretch nothing on screen ever painted into.
 * `items-start` anchors every board to its row track's own top line instead
 * (a plain, well-supported grid alignment keyword, no subgrid needed) — each
 * board's box now equals its own content height, so a solved board "shrinks
 * from the bottom" precisely as far as its scored rows go, while its top
 * edge stays exactly where stretch already held it. Two boards is why this
 * lives on the `boardCount === 2` branch too, not just the compact one:
 * Dueto's own row has the identical two-items-one-row shape (at every width
 * now, rather than only from `sm:` up — see item 2 above), and the same
 * invisible stretch measured there too. The one place this row's own track
 * HEIGHT actually shrinks is when EVERY board sharing that row has solved
 * (measured: a solved pair's row track drops to its own two boards' max
 * height, and the next row moves up to meet it) — a lone solved board next
 * to a still-playing one can never shrink the row itself, since the track
 * still has to fit its unsolved neighbour's nine rows; `items-start` fixes
 * the box that was lying about its own height, not the row height that
 * genuinely still needs to be there.
 */
export function BoardGrid({ state, shakeToken = 0, onSelectCell }: BoardGridProps) {
  const boardCount = state.boards.length;
  const compact = boardCount > 2;

  const containerClass =
    boardCount <= 1
      ? 'flex w-full max-w-sm flex-col items-center'
      : boardCount === 2
        ? 'grade-dupla grid w-full max-w-3xl grid-cols-2 items-start gap-2 sm:gap-6'
        : 'grade-compacta grid w-full max-w-md grid-cols-2 items-start gap-3 lg:max-w-6xl lg:grid-cols-4 lg:gap-6';

  return (
    <div className={containerClass}>
      {state.boards.map((_board, index) => (
        <Board
          key={index}
          state={state}
          boardIndex={index}
          shakeToken={shakeToken}
          compact={compact}
          onSelectCell={onSelectCell}
        />
      ))}
    </div>
  );
}
