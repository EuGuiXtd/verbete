import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast } from '../Toast';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast', () => {
  it('shows the message it was given', () => {
    render(<Toast id={1} message="A palavra tem cinco letras" onDismiss={() => {}} />);
    expect(screen.getByText('A palavra tem cinco letras')).toBeDefined();
  });

  it('dismisses itself after its display window, passing back its own id', () => {
    const onDismiss = vi.fn();
    render(<Toast id={7} message="Você já tentou essa" onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(2599);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledWith(7);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('clears its timer on unmount, so a stale dismiss never fires', () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<Toast id={1} message="A palavra tem cinco letras" onDismiss={onDismiss} />);

    unmount();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
