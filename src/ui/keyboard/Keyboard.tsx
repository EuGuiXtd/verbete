import { KEY_ROWS } from '../../engine/keyboard';
import type { KeyState } from '../../engine/keyboard';
import { Key, vibrateOnTouch } from './Key';

export interface KeyboardProps {
  readonly states: ReadonlyMap<string, readonly KeyState[]>;
  readonly boardCount: number;
  readonly onKey: (letter: string) => void;
  readonly onEnter: () => void;
  readonly onBackspace: () => void;
}

interface ActionKeyProps {
  readonly label: string;
  readonly ariaLabel: string;
  readonly onPress: () => void;
}

/**
 * ENVIAR / apagar are action keys, not scored letters: they never carry a
 * per-board state and never split into bands. They still get the same
 * `.tecla` treatment, the same 44px floor and the same vibrate-on-touch
 * guard as a letter key, via the shared `vibrateOnTouch` from Key.tsx —
 * one guard, not a second copy of it.
 */
function ActionKey({ label, ariaLabel, onPress }: ActionKeyProps) {
  return (
    <button
      type="button"
      className="tecla min-h-11 px-4"
      aria-label={ariaLabel}
      onClick={onPress}
      onTouchStart={vibrateOnTouch}
    >
      {label}
    </button>
  );
}

/**
 * The only touch input path in the game. Maps KEY_ROWS (QWERTY, A–Z, no
 * cedilla, no accents) and appends a submit and a backspace key to the
 * last row. There is no `<input>` behind this — every letter the player
 * types arrives through `onKey`, exactly like a tap on this keyboard would.
 */
export function Keyboard({ states, boardCount, onKey, onEnter, onBackspace }: KeyboardProps) {
  const unusedForEveryBoard: readonly KeyState[] = Array.from({ length: boardCount }, () => 'unused');
  const lastRowIndex = KEY_ROWS.length - 1;

  return (
    <div className="flex flex-col items-center gap-[6px]" role="group" aria-label="Teclado">
      {KEY_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center gap-[6px]">
          {row.map((letter) => (
            <Key key={letter} letter={letter} states={states.get(letter) ?? unusedForEveryBoard} onPress={onKey} />
          ))}
          {rowIndex === lastRowIndex && (
            <>
              <ActionKey label="enviar" ariaLabel="Enviar tentativa" onPress={onEnter} />
              <ActionKey label="apagar" ariaLabel="Apagar última letra" onPress={onBackspace} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
