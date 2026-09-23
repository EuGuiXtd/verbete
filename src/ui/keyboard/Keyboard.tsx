import { KEY_ROWS } from '../../engine/keyboard';
import type { KeyState } from '../../engine/keyboard';
import type { ReactNode } from 'react';
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
 * from Key.tsx — one guard, not a second copy of it.
 *
 * Feedback round 1, item 5: they grow from the SAME free space every letter
 * key does, just at 1.5x the share, because they hold six characters rather
 * than one. That ratio, not a fixed width or a horizontal padding, is what
 * makes the last row fit any viewport — see this file's own doc comment on
 * `Keyboard` for the whole argument.
 *
 * 1.5 exactly, and not a rounder 2: this row holds seven letters and two
 * action keys, so at 1.5 it asks for 7 + 2x1.5 = 10 shares — precisely the
 * ten the top row asks for. Every letter key in the keyboard therefore comes
 * out the SAME width as every other, at every viewport, which is both what a
 * keyboard should look like and the reason the narrowest key in the app is
 * the same 24.1px at 280px as the top row's rather than the 23px a 1.8 share
 * measured. `.tecla-acao` (index.css) shrinks the label's type with the
 * viewport so "enviar" still fits inside that share at the bottom end.
 */
function ActionKey({ label, ariaLabel, onPress }: ActionKeyProps) {
  return (
    <button
      type="button"
      className="tecla tecla-acao min-h-11 min-w-0 max-w-[4.5rem] flex-[1.5] px-0"
      aria-label={ariaLabel}
      onClick={onPress}
      onTouchStart={vibrateOnTouch}
    >
      {label}
    </button>
  );
}

/**
 * How many equal shares of a row's width every row divides itself into.
 *
 * Ten, because the top row has ten letters and is therefore the row that
 * decides how wide a letter key can be. The other two rows are made to ask
 * for the same ten so that EVERY letter key in the keyboard comes out the
 * same width at every viewport: the bottom row's seven letters plus two
 * action keys at `ACTION_SHARE` come to exactly ten, and the middle row's
 * nine letters are padded with `SPACER_CLASS`'s half-share of empty space at
 * each end — which is also what gives that row the inset a real QWERTY
 * keyboard has.
 */
const ROW_SHARES = 10;

/** See `ActionKey` for why 1.5 and not a rounder number. */
const ACTION_SHARE = 1.5;

/**
 * One complete class string per spacer share, never an interpolated one:
 * Tailwind's scanner reads source as plain text and would prune
 * `flex-[${share}]` from the build entirely. Same pattern as
 * src/ui/board/Tile.tsx's `STATE_CLASS`.
 *
 * A row whose share arithmetic lands on anything not listed here simply gets
 * no spacer. That is a degradation, not a break: its keys come out a little
 * wider than the other rows', exactly as they did before this existed, and
 * it still cannot overflow — nothing in this keyboard can.
 */
const SPACER_CLASS: Record<string, string | undefined> = {
  '0.5': 'flex-[0.5]',
};

/**
 * One keyboard row. There is nothing left in it but a centred flex line —
 * no scrollport, no `data-edges`, no ResizeObserver, no mask.
 *
 * Feedback round 1, item 5: "O teclado do Verbete no celular fica tendo que
 * rolar para os lados para ver inteiro; deveria já mostrar inteiro na tela."
 * This defect had been fixed twice before, once aimed at 320px and once at
 * 390px, and it came back on the owner's own phone both times, because both
 * fixes were the same shape: keep a fixed key width, keep the scroll
 * container, and pick a floor small enough that the widths someone thought
 * to test happened to fit. A row whose content width is a CONSTANT and whose
 * container width is the VIEWPORT will always overflow at some viewport, and
 * the only question is which one.
 *
 * So the constant is gone. Every key in this row is `flex: 1.8 1 0` or
 * `flex: 1 1 0` with `min-width: 0` (see Key.tsx and `ActionKey` above), so
 * a row's keys divide whatever width the row HAS rather than adding up to a
 * width the row must find; the inter-key gap is itself a `clamp()` on `vw`
 * (`.fila-teclado`, index.css) so it shrinks with everything else instead of
 * being the one term that does not. A `max-width` per key stops that same
 * rule producing absurd 100px keys on a desktop, and it is a CEILING, which
 * can never cause an overflow — only a floor can.
 *
 * `justify-center` is safe again precisely because of that. It was the
 * dangerous half of the old construction (centring content WIDER than its
 * scrollport shifts the flex line so it starts left of x=0, and `scrollLeft`
 * cannot go negative to reach it — Task 23 measured "Q" stranded off-screen
 * at every reachable scroll position at 320px). With no content that can be
 * wider than the row, there is no negative offset for it to produce: it only
 * ever centres the leftover space once the keys have hit their ceiling.
 *
 * `.tecla`'s focus ring stays INSET (`outline-offset: -2px`, index.css). It
 * no longer has to be — nothing here clips any more — but an inset ring
 * needs no room outside the key box, and the alternative, padding this row
 * to make room for an outset one, was measured in Task 25 to cost 36px of
 * keyboard height and push Solo's sixth row off screen at 360x800.
 */
function KeyboardRow({ children }: { readonly children: ReactNode }) {
  return <div className="fila-teclado flex w-full justify-center">{children}</div>;
}

/**
 * The only touch input path in the game. Maps KEY_ROWS (QWERTY, A–Z, no
 * cedilla, no accents) and appends a submit and a backspace key to the last
 * row. There is no `<input>` behind this — every letter the player types
 * arrives through `onKey`, exactly like a tap on this keyboard would.
 *
 * Nothing in this component, in `Key`, or in `.tecla` fixes a key's width at
 * any viewport. That is the whole of feedback round 1, item 5; see
 * `KeyboardRow` just above for why it is stated as an absence rather than as
 * a number.
 */
export function Keyboard({ states, boardCount, onKey, onEnter, onBackspace }: KeyboardProps) {
  const unusedForEveryBoard: readonly KeyState[] = Array.from({ length: boardCount }, () => 'unused');
  const lastRowIndex = KEY_ROWS.length - 1;

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-[6px]" role="group" aria-label="Teclado">
      {KEY_ROWS.map((row, rowIndex) => {
        const actions = rowIndex === lastRowIndex ? 2 : 0;
        const spacer = SPACER_CLASS[String((ROW_SHARES - row.length - actions * ACTION_SHARE) / 2)];
        return (
          <KeyboardRow key={rowIndex}>
            {/* Empty, unfocusable, and hidden from assistive technology: this
                is width, not a control. */}
            {spacer !== undefined && <div aria-hidden="true" className={spacer} />}
            {row.map((letter) => (
              <Key key={letter} letter={letter} states={states.get(letter) ?? unusedForEveryBoard} onPress={onKey} />
            ))}
            {actions > 0 && (
              <>
                <ActionKey label="enviar" ariaLabel="Enviar tentativa" onPress={onEnter} />
                <ActionKey label="apagar" ariaLabel="Apagar última letra" onPress={onBackspace} />
              </>
            )}
            {spacer !== undefined && <div aria-hidden="true" className={spacer} />}
          </KeyboardRow>
        );
      })}
    </div>
  );
}
