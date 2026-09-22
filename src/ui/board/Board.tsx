import { WORD_LENGTH } from '../../engine/constants';
import { boardRows } from '../../engine/match';
import type { MatchState } from '../../engine/match';
import { Row } from './Row';
import type { RowCell } from './Row';

export interface BoardProps {
  readonly state: MatchState;
  readonly boardIndex: number;
  /**
   * Bumped by MatchProvider once per REJECTED effect (see its `shakeToken`
   * doc comment), 0 or omitted otherwise. Folded into the active row's own
   * React key below — not just passed as a boolean — so React remounts
   * that one row's DOM node on every new token, which is what makes the
   * CSS shake animation replay even for two identical rejections in a row.
   */
  readonly shakeToken?: number;
  /** Threaded straight through to every Row — see Row's own doc comment. */
  readonly compact?: boolean;
}

function emptyCells(): RowCell[] {
  return Array.from({ length: WORD_LENGTH }, () => ({ letter: '', state: 'empty' as const }));
}

function draftCells(draft: string): RowCell[] {
  return Array.from({ length: WORD_LENGTH }, (_unused, index) => {
    const letter = draft[index];
    return letter === undefined
      ? { letter: '', state: 'empty' as const }
      : { letter, state: 'filled' as const };
  });
}

/**
 * `maxAttempts` rows, built from three sources in order: the scored rows
 * `boardRows` already truncates at `solvedAt`, one active row built from
 * `state.draft`, then empty rows for whatever is left.
 *
 * A solved board freezes for free: `boardRows` stops handing us rows past
 * the guess that solved it, and this component does not add any back — no
 * draft row, no empty padding up to `maxAttempts`. That is the whole
 * freeze; there is no separate branch for it.
 */
export function Board({ state, boardIndex, shakeToken = 0, compact = false }: BoardProps) {
  const board = state.boards[boardIndex];
  if (!board) return null;

  const rows = boardRows(state, boardIndex);
  const rowCells: RowCell[][] = rows.map((row) =>
    row.tiles.map((tileState, index) => ({ letter: row.guess[index] ?? '', state: tileState })),
  );

  const solved = board.solvedAt !== null;
  // The draft row's position, fixed before the padding loop below appends
  // more (identical-looking, all-empty) rows after it. A solved board has
  // no active row at all.
  const activeIndex = solved ? -1 : rowCells.length;
  if (!solved) {
    if (rowCells.length < state.maxAttempts) {
      rowCells.push(draftCells(state.draft));
    }
    while (rowCells.length < state.maxAttempts) {
      rowCells.push(emptyCells());
    }
  }

  const wrapperClass = solved
    ? compact
      ? 'flex w-full flex-col gap-1 opacity-60 pointer-events-none'
      : 'flex w-full flex-col gap-2 opacity-60 pointer-events-none'
    : compact
      ? 'flex w-full flex-col gap-1'
      : 'flex w-full flex-col gap-2';

  return (
    <div className={wrapperClass} aria-disabled={solved ? true : undefined}>
      {/*
       * Task 25: a frozen board used to signal "done" through `opacity-60`
       * alone. At Quarteto's compact tile size that dimming reads as too
       * subtle — a board that solved on its very first guess collapses to
       * one small, faint row, which an unfamiliar player can misread as
       * "hasn't started yet" (the one visual state this game never actually
       * has, since even an untouched board shows a full `maxAttempts` of
       * empty tiles) rather than "finished". Wrong reading in the direction
       * that matters most: it looks like there's nothing to see, so a
       * player might never notice they solved it. A word, not a stronger
       * fade, fixes the ambiguity outright regardless of tile size — see
       * this task's report for why a caption was chosen over deepening the
       * opacity. `aria-hidden`: purely a sighted affordance: a screen-reader
       * user already gets "resolvido" from `aria-disabled` on this same
       * element and from the live-region announcement (GuessAnnouncer.tsx)
       * the instant the board actually solved — this text would only repeat
       * that, silently, on every subsequent guess a screen reader visits
       * this board.
       */}
      {solved && (
        <p className="text-micro italic uppercase tracking-wide text-ghost" aria-hidden="true">
          resolvido
        </p>
      )}
      {rowCells.map((cells, index) => {
        const isActive = index === activeIndex;
        const shaking = isActive && shakeToken > 0;
        return (
          <Row
            key={shaking ? `active-shake-${String(shakeToken)}` : index}
            cells={cells}
            shake={shaking}
            compact={compact}
          />
        );
      })}
    </div>
  );
}
