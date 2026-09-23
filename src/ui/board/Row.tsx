import { isScoredState, Tile } from './Tile';
import type { TileVisualState } from './Tile';

export interface RowCell {
  readonly letter: string;
  readonly state: TileVisualState;
}

export interface RowProps {
  readonly cells: readonly RowCell[];
  /**
   * True for one shake animation on the active row, in response to a
   * REJECTED effect (see MatchProvider.tsx's shakeToken). Applied as a
   * plain extra class on this component's own root — never a second
   * wrapper element — so it does not disturb the DOM shape
   * Board.test.tsx's `rowsOf` selector depends on.
   */
  readonly shake?: boolean;
  /**
   * Quarteto's 2x2 grid only (see BoardGrid.tsx: `compact = boardCount > 2`).
   * Tightens the inter-tile gap from `gap-2` to `gap-1` so four 9-row
   * boards have a fighting chance of fitting an iPhone SE — the tile's own
   * glyph size shrinks separately, via `--text-tile` being overridden on an
   * ancestor (see index.css's `.grade-compacta`), which is why this
   * component never needs to know about that half of the strategy.
   */
  readonly compact?: boolean;
  /**
   * The house the next typed letter lands in, or null for every row that is
   * not the active one (feedback round 1, item 3). `WORD_LENGTH` is a legal
   * value of the engine's cursor — "past the last house", where a complete
   * draft parks it — and simply matches no tile here, which is the right
   * rendering: there is no house to mark.
   */
  readonly cursorIndex?: number | null;
  /** Passed straight to each Tile; see Tile's own doc comment on `onSelect`. */
  readonly onSelectCell?: (index: number) => void;
}

/**
 * Five tiles. The engine stores letters uppercase and diacritic-free
 * already (see engine/normalize.ts), but the uppercasing itself is a
 * display concern, not an engine one — it happens here, at the point the
 * letter is handed to a Tile, and never touches the `cells` this component
 * was given.
 *
 * Only a scored tile (correct/present/absent) gets a non-zero reveal step:
 * that is the row that just cascaded into being pressed. An active
 * (filled/empty) row has nothing to reveal, so every tile in it starts
 * from the same, zero, delay.
 */
export function Row({ cells, shake = false, compact = false, cursorIndex = null, onSelectCell }: RowProps) {
  // Feedback round 1, item 2: the non-compact gap is now `gap-1` below `sm:`
  // and `gap-2` from there up. Solo barely notices (a 320px tile grows from
  // 51 to 54px a side), but Dueto — side by side at every width now, see
  // BoardGrid.tsx — is spending that 32px of inter-tile gap out of HALF the
  // content width rather than all of it, where it is worth ~3px per tile.
  // Written out as four complete class strings rather than assembled,
  // exactly as the pre-existing pair already were.
  const rowClass = shake
    ? compact
      ? 'grid grid-cols-5 gap-1 tremor'
      : 'grid grid-cols-5 gap-1 tremor sm:gap-2'
    : compact
      ? 'grid grid-cols-5 gap-1'
      : 'grid grid-cols-5 gap-1 sm:gap-2';
  return (
    <div className={rowClass}>
      {cells.map((cell, index) => (
        <Tile
          key={index}
          letter={cell.letter.toUpperCase()}
          state={cell.state}
          revealDelay={isScoredState(cell.state) ? index : 0}
          isCursor={index === cursorIndex}
          onSelect={onSelectCell === undefined ? undefined : () => { onSelectCell(index); }}
        />
      ))}
    </div>
  );
}
