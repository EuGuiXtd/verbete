import { useEffect, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { blurOnMouseActivation } from '../blurOnMouseActivation';

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
 *   This restore only does anything useful if the trigger button is still
 *   genuinely focused at the moment this component mounts. `blurOnMouseActivation`
 *   would otherwise have already blurred it for a real mouse click, by the
 *   time this effect runs — which is why every button whose ONLY job is to
 *   open one of these four modals (`Header`'s Ajuda/Estatísticas,
 *   `HelpModal`'s "sobre as fontes", `StatsModal`'s "ver histórico
 *   completo") no longer calls `blurOnMouseActivation` at all. That trades
 *   away one guarantee for another: those specific buttons can now stay
 *   genuinely focused after a mouse click (needed for the restore to have a
 *   real target), which reopens the door `blurOnMouseActivation` exists
 *   codebase-wide to close — a still-focused button "owns" the next
 *   Enter/Space per `usePhysicalKeyboard.ts`'s `isButtonOwnedActivationKey`,
 *   so a player who closes a modal by mouse and immediately presses Enter
 *   (rather than typing a letter first) re-activates the trigger instead of
 *   submitting a guess. See this task's report for why that trade was made
 *   deliberately rather than silently.
 */
export function Modal({ titleId, title, onClose, children, headerExtra }: ModalProps) {
  const triggerRef = useRef<Element | null>(null);

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
      <div className="folha" role="dialog" aria-modal="true" aria-labelledby={titleId}>
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
