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
 * `.tecla` treatment, the same 44px height floor and the same
 * vibrate-on-touch guard as a letter key, via the shared `vibrateOnTouch`
 * from Key.tsx — one guard, not a second copy of it. Horizontal padding is
 * the one dimension that gives on the narrowest phones — see Key.tsx's
 * `SINGLE_STATE_CLASS` doc comment for the overflow this and the row gap
 * below are both part of fixing.
 */
function ActionKey({ label, ariaLabel, onPress }: ActionKeyProps) {
  return (
    <button
      type="button"
      className="tecla min-h-11 px-2 sm:px-4"
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
 *
 * `overflow-x-auto` is a safety net, not the fix: Key.tsx's narrower
 * mobile floor and this row's tighter gap already fit every row inside an
 * iPhone SE's width by a real margin (measured by hand — see task-18's
 * report). This only catches a future letter, a longer action label, or a
 * device narrower than any of that math assumed, and it is scoped to the
 * keyboard itself — `overscroll-x-contain` plus Shell's own
 * `overflow-x-hidden` (see Shell.tsx) keep a scroll here from ever
 * dragging the whole page sideways.
 */
export function Keyboard({ states, boardCount, onKey, onEnter, onBackspace }: KeyboardProps) {
  const unusedForEveryBoard: readonly KeyState[] = Array.from({ length: boardCount }, () => 'unused');
  const lastRowIndex = KEY_ROWS.length - 1;

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-[6px]" role="group" aria-label="Teclado">
      {KEY_ROWS.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="flex w-full justify-center gap-1 overflow-x-auto overscroll-x-contain sm:gap-[6px]"
        >
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
