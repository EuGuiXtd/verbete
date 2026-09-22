import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/*
 * No extra "is this actually visible" filter on top of the selector above
 * (an `offsetParent !== null` check was the first draft): every modal in
 * this app either renders a piece of content or does not — none of them
 * keep a focusable control mounted but CSS-hidden — so there is nothing
 * such a filter would ever catch here, and `offsetParent` specifically is
 * the wrong tool to reach for regardless, since jsdom (this file's own
 * test environment, see useFocusTrap.test.tsx) never computes layout and
 * always reports it as `null` — a filter built on it would silently empty
 * this list in every unit test while doing nothing in a real browser.
 */
function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Keeps Tab/Shift+Tab cycling inside `containerRef`'s subtree while `active`
 * is true — the WAI-ARIA dialog pattern's focus trap, added here rather than
 * a third-party dependency because the shape this app needs is narrow: two
 * dialog implementations (Modal.tsx and ResultModal.tsx), neither wanting
 * anything moved on mount.
 *
 * Deliberately does NOT move focus anywhere when `active` becomes true. Both
 * callers already have hard-won reasons never to steal focus at open time —
 * see Modal.tsx's own doc comment on the exact bug that produces (the
 * dialog's own opening keypress landing on a freshly-focused control and
 * closing it before it was ever visibly rendered). Instead this only acts on
 * an actual Tab keydown: if focus is already inside the container it wraps
 * at the two ends exactly like the pattern describes; if focus is anywhere
 * else at all — which, given the above, is exactly where it sits right after
 * a keyboard-driven open, on the trigger button outside this container — the
 * very first Tab is redirected straight to the container's own first
 * focusable element (Shift+Tab to its last) rather than left free to walk
 * off into whatever the dialog happens to be layered on top of.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;

      const elements = focusableElements(container);
      if (elements.length === 0) {
        // Nothing inside to receive focus at all — trap it on the container
        // itself rather than letting Tab escape to the page underneath.
        event.preventDefault();
        return;
      }

      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      const insideContainer = container.contains(document.activeElement);

      if (event.shiftKey) {
        if (!insideContainer || document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!insideContainer || document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, active]);
}
