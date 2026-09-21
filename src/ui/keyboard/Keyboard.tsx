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
 * `overflow-x-auto` is a safety net for a row wider than the viewport, but
 * the row itself does NOT center that overflowing content with
 * `justify-content` — see the doc comment on the inner, `.mx-auto` wrapper
 * below for why, and Task 23's report for the measurements. Key.tsx's
 * narrower mobile floor keeps a SINGLE-key row's overflow small (Solo, one
 * board), but Task 23 found this row also has to carry a SEGMENTED key
 * row (Dueto/Quarteto), which is fixed at 44px with no narrower mobile
 * variant (see Key.tsx's `.tecla-multipla`) — at 320px that overflows by
 * far more than the single-key case ever did, and a naive
 * `justify-center` on the scrolling row itself made the overflow on the
 * LEFT permanently unreachable (`scrollLeft` cannot go negative), not just
 * present. `overscroll-x-contain` plus Shell's own `overflow-x-hidden`
 * (see Shell.tsx) keep any scrolling here from ever dragging the whole
 * page sideways.
 */
export function Keyboard({ states, boardCount, onKey, onEnter, onBackspace }: KeyboardProps) {
  const unusedForEveryBoard: readonly KeyState[] = Array.from({ length: boardCount }, () => 'unused');
  const lastRowIndex = KEY_ROWS.length - 1;

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-[6px]" role="group" aria-label="Teclado">
      {KEY_ROWS.map((row, rowIndex) => (
        // The scroller: no `justify-content` and no `align-items` of its
        // own. Centering a row's keys with `justify-content: center` here
        // (the previous version of this component) is the exact same trap
        // Shell.tsx's own doc comment describes for the vertical axis, just
        // horizontal: when the keys are wider than this row (Dueto/
        // Quarteto's segmented keys at 320px), centering shifts the whole
        // flex line so it starts to the LEFT of x=0 — and `scrollLeft`
        // cannot go negative to reach it. Measured directly: the very first
        // key ("Q") sat off-screen at every reachable scroll position, not
        // just the initial one — a real, fully unreachable key, not merely
        // an inconvenient one.
        <div key={rowIndex} className="flex w-full overflow-x-auto overscroll-x-contain">
          {/*
            `shrink-0`: same reason as Shell.tsx's `.grid-anchor` — without
            it, this wrapper's default `flex-shrink: 1` would let the row
            (whose own width is fixed by the viewport) compress it below
            its own keys' combined width instead of overflowing them,
            visually squashing every key in the row. `mx-auto` is the part
            that actually centers: auto margins on a flex item absorb
            whatever POSITIVE free space exists (centering this row's keys
            exactly like `justify-center` did when they fit), and collapse
            to zero the moment content is wider than the row — which is
            what makes the overflowing case start flush at the row's own
            left edge, reachable by ordinary rightward scrolling, instead
            of spilling unreachably off both sides.
          */}
          <div className="mx-auto flex shrink-0 gap-1 sm:gap-[6px]">
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
        </div>
      ))}
    </div>
  );
}
