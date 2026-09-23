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
   * The tile's stagger step within its row (its 0-based column index), not
   * a raw millisecond count. The actual delay is derived from
   * --reveal-duration, the same token tokens.css already collapses to 0ms
   * under prefers-reduced-motion, so a row's left-to-right press cascades in
   * every mode but becomes instant in that one without this component
   * hard-coding a duration of its own.
   */
  readonly revealDelay?: number;
}

export function Tile({ letter, state, revealDelay = 0 }: TileProps) {
  const accessibilityProps = isScoredState(state)
    ? { role: 'img' as const, 'aria-label': `${letter}, ${STATE_LABEL[state]}` }
    : state === 'empty'
      ? { 'aria-hidden': true as const }
      : {};

  return (
    <div
      className={STATE_CLASS[state]}
      style={{ transitionDelay: `calc(var(--reveal-duration) * ${revealDelay} / ${WORD_LENGTH})` }}
      {...accessibilityProps}
    >
      {letter}
    </div>
  );
}
