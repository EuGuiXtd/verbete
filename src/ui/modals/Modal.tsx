import { useEffect, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { blurOnMouseActivation } from '../blurOnMouseActivation';
import { useFocusTrap } from './useFocusTrap';

export interface ModalProps {
  readonly titleId: string;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Rendered between the title row and the hairline — e.g. a variant/mode selector. */
  readonly headerExtra?: ReactNode;
}

/**
 * The shared chrome every screen this task adds (Stats/History/Help/About)
 * shares with `ResultModal`: the same `.cortina`/`.folha`/`.folha-regua`
 * classes from index.css, the same "fechar" link in the same spot, the same
 * click-outside-the-sheet and Escape dismissal. Read `ResultModal.tsx`'s own
 * doc comment before changing any of this — the conventions below are
 * copied from it on purpose, not reinvented:
 *
 * - Tab/Shift+Tab is trapped inside the sheet (`useFocusTrap.ts`, Task 25) —
 *   without it, Tab from a keyboard-opened trigger would walk into whatever
 *   DOM order happens to put next (the header's other buttons, in this
 *   app's case), never into the dialog it just opened, since opening never
 *   moves focus (see the next bullet). The trap only acts on Tab itself, so
 *   it cannot reintroduce the mount-time focus steal the next bullet exists
 *   to avoid.
 * - Escape closes, exactly like ResultModal's own `keydown` listener.
 * - A click that lands on the backdrop itself (not bubbled up from the
 *   sheet) closes too, via the `event.target === event.currentTarget` check.
 * - Deliberately does NOT move focus into the dialog when it opens. A
 *   player can reach every one of these from a keyboard (Tab to "Ajuda" or
 *   "Estatísticas", then Enter/Space to activate it) — stealing focus in a
 *   mount effect would risk the exact bug ResultModal's own comment
 *   documents: the same activation keystroke that opened the dialog is
 *   still being processed by the browser when the effect runs, so a
 *   freshly-focused close button can absorb that key's `keyup` and close
 *   the dialog before it was ever visibly rendered. Leaving focus wherever
 *   the player's last keypress or click landed avoids that entirely; a
 *   keyboard user can still Tab forward into the dialog's own controls.
 * - DOES move focus back to whatever triggered the dialog once it closes
 *   (review round 2, Task 22) — the WAI-ARIA dialog pattern's own
 *   recommendation, and the fix for a real gap: `ResultModal` never needed
 *   this because it has no discrete trigger button to return to (a match
 *   just finishes on its own), but every one of these four does. The
 *   element focused at mount time is captured once into a ref and restored
 *   on unmount, guarded for the case where that element no longer exists in
 *   the document (its own screen might have been replaced by another modal
 *   entirely — see the "History/About close the whole stack" note in this
 *   task's report — or removed for some unrelated reason).
 *
 *   Round 2 of this task's review first shipped this by having the four
 *   modal-opening buttons (`Header`'s Ajuda/Estatísticas, `HelpModal`'s
 *   "sobre as fontes", `StatsModal`'s "ver histórico completo") stop
 *   calling `blurOnMouseActivation`, reasoning that the restore needed the
 *   trigger to still be focused at mount time. Round 3 corrected that: it
 *   was solving the wrong problem, and cost a real regression (see below).
 *   Every one of those four buttons keeps calling `blurOnMouseActivation`,
 *   exactly like every other chrome button in this app, and the
 *   capture-and-restore above does the right thing on its own for both
 *   input methods precisely BECAUSE of that call, not despite it:
 *
 *   - Mouse click: `blurOnMouseActivation` blurs the button before `Modal`
 *     ever mounts (`event.detail !== 0`), so `document.activeElement` at
 *     mount time is `document.body` — not an `HTMLElement`, so the
 *     `instanceof HTMLElement` guard on the restore already skips it.
 *     Restoring to "nothing" is a correct no-op: a mouse user never had
 *     keyboard focus on that button to begin with, so there is nothing to
 *     give back, and no button is left focused afterwards to swallow the
 *     player's next Enter.
 *   - Keyboard: `blurOnMouseActivation` is a no-op for a keyboard-
 *     synthesized activation (`event.detail === 0`, see its own doc
 *     comment), so the button is still genuinely focused when `Modal`
 *     mounts, gets captured, and is correctly restored to on close — the
 *     WAI-ARIA behaviour a keyboard user actually needs.
 *
 *   Removing the calls (round 2's version) "worked" for the restore itself
 *   but invented focus a mouse user never had: it left the trigger focused
 *   after a mouse-driven close, which is exactly the condition
 *   `isButtonOwnedActivationKey` in `usePhysicalKeyboard.ts` treats as
 *   "owns the next Enter/Space" — a mouse player who closed, say, Stats and
 *   immediately pressed a bare Enter (without typing a letter first, which
 *   would not be button-owned) would reopen Stats instead of submitting a
 *   guess: the Task 20 bug, back through a different door. Restoring the
 *   `blurOnMouseActivation` calls removes that regression entirely, because
 *   there is no invented focus left to swallow anything.
 *   `e2e/header-modal-focus.spec.ts` asserts both paths.
 */
export function Modal({ titleId, title, onClose, children, headerExtra }: ModalProps) {
  const triggerRef = useRef<Element | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, true);

  useEffect(() => {
    // Captured once, on mount, before anything inside this dialog can move
    // focus anywhere else.
    triggerRef.current = document.activeElement;
    return () => {
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="cortina"
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={sheetRef} className="folha" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flex items-start justify-between gap-4">
          <p id={titleId} className="text-lead">
            {title}
          </p>
          <button
            type="button"
            className="text-small text-ghost underline decoration-rule underline-offset-2"
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              blurOnMouseActivation(event);
              onClose();
            }}
          >
            fechar
          </button>
        </div>
        <div className="folha-regua" />
        {headerExtra}
        {children}
      </div>
    </div>
  );
}
