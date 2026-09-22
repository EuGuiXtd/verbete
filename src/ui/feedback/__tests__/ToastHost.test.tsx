import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastHost } from '../ToastHost';

afterEach(() => {
  cleanup();
});

describe('ToastHost', () => {
  it('renders nothing extra when there are no toasts, but keeps the live region', () => {
    render(<ToastHost toasts={[]} onDismiss={() => {}} />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.queryByText(/./)).toBeNull();
  });

  it('stacks every active toast, oldest first, so a fast typist sees each rejection reason', () => {
    render(
      <ToastHost
        toasts={[
          { id: 1, text: 'A palavra tem cinco letras' },
          { id: 2, text: 'Você já tentou essa' },
        ]}
        onDismiss={() => {}}
      />,
    );

    const region = screen.getByRole('status');
    const texts = Array.from(region.querySelectorAll('.aviso')).map((node) => node.textContent);
    expect(texts).toEqual(['A palavra tem cinco letras', 'Você já tentou essa']);
  });

  it('passes its onDismiss through to each toast', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<ToastHost toasts={[{ id: 5, text: 'A palavra tem cinco letras' }]} onDismiss={onDismiss} />);

    vi.advanceTimersByTime(2600);
    expect(onDismiss).toHaveBeenCalledWith(5);
    vi.useRealTimers();
  });
});
