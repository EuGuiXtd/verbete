import { useEffect } from 'react';
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
 */
export function Modal({ titleId, title, onClose, children, headerExtra }: ModalProps) {
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
