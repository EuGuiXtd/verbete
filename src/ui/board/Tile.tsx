import { WORD_LENGTH } from '../../engine/constants';
import type { Tile as EngineTileState } from '../../engine/types';

/**
 * The three engine states plus two purely-visual ones this component owns:
 * a slot with nothing typed into it yet, and a slot holding a letter that
 * has been typed but not submitted (so it carries no feedback yet).
 */
export type TileVisualState = EngineTileState | 'empty' | 'filled';

// Written out in full, one complete class string per state: Tailwind's
// scanner reads source as plain text, so a class assembled by interpolation
// (`sorte-${state}`) would be pruned from the build. Mirrors the pattern
// established in src/dev/Showcase.tsx. The component classes themselves
// (.sorte, .sorte-vazia, .sorte-preenchida, .sorte-ausente, .sorte-presente,
// .sorte-certa) live in src/index.css — that is the one source of truth for
// the letterpress treatment the owner signed off on.
const STATE_CLASS: Record<TileVisualState, string> = {
  empty: 'sorte sorte-vazia',
  filled: 'sorte sorte-preenchida',
  correct: 'sorte sorte-certa',
  present: 'sorte sorte-presente',
  absent: 'sorte sorte-ausente',
};

// Colour is the entire feedback channel for a sighted player and none of it
// for a screen reader user, so each scored state gets its own Portuguese
// sentence rather than relying on the letter alone.
const STATE_LABEL: Record<EngineTileState, string> = {
  correct: 'na posição correta',
  present: 'existe na palavra, posição errada',
  absent: 'não existe na palavra',
};

export function isScoredState(state: TileVisualState): state is EngineTileState {
  return state === 'correct' || state === 'present' || state === 'absent';
}

export interface TileProps {
  readonly letter: string;
  readonly state: TileVisualState;
  /**
   * True for the one house in the active row that the next typed letter will
   * land in (feedback round 1, item 3). Purely a mark: `.sorte-cursor`
   * (index.css) draws an inset rule and changes nothing else about the tile,
   * so a house that is both the cursor AND already holds a letter still
   * looks exactly like the filled house it is.
   */
  readonly isCursor?: boolean;
  /**
   * Set only on the active row's tiles, and only while the match is
   * playable. Its presence is what makes this tile a pointer target: the
   * board has always been read-only display, and it stays a read-only
   * display everywhere else.
   *
   * Deliberately NOT a `<button>` and deliberately not given a `tabindex`.
   * Task 25 established that no tile is ever a Tab stop (there is an e2e
   * test asserting exactly that) and five new Tab stops between the mode
   * tabs and the keyboard would be a real cost to every keyboard player, for
   * a job the arrow keys already do from any focus position at all — see
   * usePhysicalKeyboard. This is the pointer affordance; the arrow keys are
   * the keyboard one, and the live region announces both.
   */
  readonly onSelect?: () => void;
  /**
   * The tile's stagger step within its row (its 0-based column index), not
   * a raw millisecond count. The actual delay is derived from
   * --reveal-duration, the same token tokens.css already collapses to 0ms
   * under prefers-reduced-motion, so a row's left-to-right press cascades in
   * every mode but becomes instant in that one without this component
   * hard-coding a duration of its own.
   */
  readonly revealDelay?: number;
}

export function Tile({ letter, state, revealDelay = 0, isCursor = false, onSelect }: TileProps) {
  const accessibilityProps = isScoredState(state)
    ? { role: 'img' as const, 'aria-label': `${letter}, ${STATE_LABEL[state]}` }
    : state === 'empty'
      ? { 'aria-hidden': true as const }
      : {};

  // Built by concatenation rather than interpolation into a class name:
  // every fragment below is a complete Tailwind/component class that appears
  // verbatim in this file, which is what the scanner needs (see
  // STATE_CLASS's own comment).
  const className = `${STATE_CLASS[state]}${isCursor ? ' sorte-cursor' : ''}${onSelect ? ' cursor-pointer' : ''}`;

  return (
    <div
      className={className}
      style={{ transitionDelay: `calc(var(--reveal-duration) * ${revealDelay} / ${WORD_LENGTH})` }}
      onClick={onSelect}
      {...accessibilityProps}
    >
      {letter}
    </div>
  );
}
