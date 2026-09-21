import type { KeyState } from '../../engine/keyboard';

/**
 * One complete class string per state, exactly the pattern established in
 * src/ui/board/Tile.tsx: Tailwind's scanner reads source as plain text, so a
 * class assembled by interpolation (`tecla-${state}`) would be silently
 * pruned from the build. The treatment itself — `.tecla`, `.tecla-ausente`,
 * `.tecla-presente`, `.tecla-certa`, plus the `.tecla:active` press — lives
 * in src/index.css. That is the one source of truth Task 15 already got
 * signed off; this file only ever points at it, never re-expresses it.
 *
 * `min-w-11 min-h-11` are pure sizing (the 44px touch-target floor), layered
 * on top of the treatment class the same way src/dev/Showcase.tsx layers
 * `w-9` / `px-4` alongside `.tecla` — geometry, not a second copy of the
 * ink/shadow treatment.
 */
const SINGLE_STATE_CLASS: Record<KeyState, string> = {
  unused: 'tecla min-w-11 min-h-11',
  absent: 'tecla tecla-ausente min-w-11 min-h-11',
  present: 'tecla tecla-presente min-w-11 min-h-11',
  correct: 'tecla tecla-certa min-w-11 min-h-11',
};

/**
 * Per-board bands for the segmented (Dueto/Quarteto) key. `.tecla-segmento`
 * and its state modifiers live in src/index.css, added alongside the
 * single-key classes above and built the same way: static class per state,
 * background colour drawn from the same theme tokens, no shadow of their
 * own — the outer `.tecla` button still owns the one press shadow and the
 * one 44px touch target.
 */
const SEGMENT_STATE_CLASS: Record<KeyState, string> = {
  unused: 'tecla-segmento',
  absent: 'tecla-segmento tecla-segmento-ausente',
  present: 'tecla-segmento tecla-segmento-presente',
  correct: 'tecla-segmento tecla-segmento-certa',
};

const STATE_LABEL: Record<KeyState, string> = {
  unused: 'ainda sem tentativa',
  absent: 'não existe na palavra',
  present: 'existe na palavra, posição errada',
  correct: 'na posição correta',
};

/**
 * A screen-reader user gets no ink at all, so the label is their entire
 * feedback channel. An untried key (every board still `unused`) gets no
 * override at all — the visible letter is already its accessible name, and
 * announcing "ainda sem tentativa" on all 26 keys before a single guess is
 * submitted is noise, not information. Once at least one board has a
 * result, every board is named explicitly.
 */
function ariaLabelFor(letter: string, states: readonly KeyState[]): string | undefined {
  if (states.every((state) => state === 'unused')) return undefined;
  const first = states[0];
  if (states.length === 1 && first !== undefined) return `${letter}, ${STATE_LABEL[first]}`;
  const perBoard = states.map((state, index) => `tabuleiro ${index + 1}: ${STATE_LABEL[state]}`);
  return `${letter}, ${perBoard.join('; ')}`;
}

// Module-level so it is created once, not re-allocated on every render of
// every key, and so Keyboard.tsx's action keys (ENVIAR / apagar) can share
// the exact same guard instead of a second copy of it.
export function vibrateOnTouch(): void {
  navigator.vibrate?.(8);
}

export interface KeyProps {
  readonly letter: string;
  /** One state per board — a Solo key gets an array of one, Quarteto four. */
  readonly states: readonly KeyState[];
  readonly onPress: (letter: string) => void;
}

/**
 * A letter key. When `states.length > 1` the key splits into that many
 * vertical bands sharing one touch target and one press, one per board, so
 * a Quarteto key can show four independent results without becoming four
 * separate buttons a player would have to tap in sequence.
 */
export function Key({ letter, states, onPress }: KeyProps) {
  const segmented = states.length > 1;

  return (
    <button
      type="button"
      className={segmented ? 'tecla tecla-multipla min-w-11 min-h-11' : SINGLE_STATE_CLASS[states[0] ?? 'unused']}
      aria-label={ariaLabelFor(letter, states)}
      onClick={() => {
        onPress(letter);
      }}
      onTouchStart={vibrateOnTouch}
    >
      {segmented && (
        <span className="tecla-multipla-fundo" aria-hidden="true">
          {states.map((state, index) => (
            <span key={index} className={SEGMENT_STATE_CLASS[state]} />
          ))}
        </span>
      )}
      <span className={segmented ? 'tecla-multipla-letra' : undefined}>{letter}</span>
    </button>
  );
}
