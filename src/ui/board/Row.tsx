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
export function Row({ cells, shake = false }: RowProps) {
  return (
    <div className={shake ? 'grid grid-cols-5 gap-2 tremor' : 'grid grid-cols-5 gap-2'}>
      {cells.map((cell, index) => (
        <Tile
          key={index}
          letter={cell.letter.toUpperCase()}
          state={cell.state}
          revealDelay={isScoredState(cell.state) ? index : 0}
        />
      ))}
    </div>
  );
}
