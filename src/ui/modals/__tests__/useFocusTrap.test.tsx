import { useRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusTrap } from '../useFocusTrap';

afterEach(() => {
  cleanup();
});

interface HarnessProps {
  readonly active: boolean;
  readonly empty?: boolean;
}

/**
 * A trigger button OUTSIDE the trapped container, then three focusable
 * controls inside it — the same shape every real caller has: Modal.tsx's
 * "Ajuda"/"Estatísticas" buttons sit outside `.folha`, exactly like
 * `<button>fora</button>` sits outside `container` here.
 */
function Harness({ active, empty = false }: HarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, active);

  return (
    <>
      <button type="button">fora</button>
      <div ref={containerRef} data-testid="container">
        {!empty && (
          <>
            <button type="button">primeiro</button>
            <button type="button">meio</button>
            <button type="button">ultimo</button>
          </>
        )}
      </div>
    </>
  );
}

function tab(shiftKey = false): void {
  act(() => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
  });
}

describe('useFocusTrap', () => {
  it('redirects the very first Tab from outside the container to its first focusable element', () => {
    render(<Harness active />);
    screen.getByText('fora').focus();
    expect(document.activeElement).toBe(screen.getByText('fora'));

    tab();

    expect(document.activeElement).toBe(screen.getByText('primeiro'));
  });

  it('wraps Tab from the last element back to the first', () => {
    render(<Harness active />);
    screen.getByText('ultimo').focus();

    tab();

    expect(document.activeElement).toBe(screen.getByText('primeiro'));
  });

  it('wraps Shift+Tab from the first element back to the last', () => {
    render(<Harness active />);
    screen.getByText('primeiro').focus();

    tab(true);

    expect(document.activeElement).toBe(screen.getByText('ultimo'));
  });

  it('does not touch focus on an ordinary Tab from a middle element', () => {
    render(<Harness active />);
    screen.getByText('meio').focus();

    // A real browser would move focus on to "ultimo" on its own; jsdom does
    // not simulate that default. What this proves is the negative: the trap
    // itself must not have intercepted this Tab (no preventDefault path
    // taken), which is exactly what would happen if the trap wrongly
    // treated every element as an edge.
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    let defaultPrevented = false;
    document.addEventListener('keydown', () => {
      defaultPrevented = event.defaultPrevented;
    });
    act(() => {
      document.dispatchEvent(event);
    });
    expect(defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(screen.getByText('meio'));
  });

  it('does nothing while inactive — Tab from outside is left alone', () => {
    render(<Harness active={false} />);
    screen.getByText('fora').focus();

    tab();

    expect(document.activeElement).toBe(screen.getByText('fora'));
  });

  it('traps Tab on an empty container rather than letting it escape', () => {
    render(<Harness active empty />);
    screen.getByText('fora').focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    // No focusable element inside to move to — focus simply never leaves.
    expect(document.activeElement).toBe(screen.getByText('fora'));
  });

  it('stops trapping once active turns false', () => {
    const { rerender } = render(<Harness active />);
    screen.getByText('ultimo').focus();
    tab();
    expect(document.activeElement).toBe(screen.getByText('primeiro'));

    rerender(<Harness active={false} />);
    screen.getByText('ultimo').focus();
    tab();
    // With the trap detached, this Tab is not intercepted — focus stays
    // exactly where the test itself left it (jsdom performs no default Tab
    // movement of its own).
    expect(document.activeElement).toBe(screen.getByText('ultimo'));
  });
});
