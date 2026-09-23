import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Key, segmentedTextGradient, vibrateOnTouch } from '../Key';

afterEach(() => {
  cleanup();
  if (Object.prototype.hasOwnProperty.call(navigator, 'vibrate')) {
    delete (navigator as { vibrate?: unknown }).vibrate;
  }
});

describe('Key', () => {
  it('reports its letter when pressed', () => {
    const onPress = vi.fn();
    render(<Key letter="A" states={['unused']} onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onPress).toHaveBeenCalledWith('A');
  });

  it('meets the 44px touch target via sizing utilities', () => {
    render(<Key letter="A" states={['unused']} onPress={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'A' });
    expect(button.className).toContain('min-w-11');
    expect(button.className).toContain('min-h-11');
  });

  it('carries the pressable-key treatment class for an untried letter', () => {
    render(<Key letter="A" states={['unused']} onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'A' }).className).toContain('tecla');
  });

  it('carries the absent-key treatment class once scored', () => {
    render(<Key letter="A" states={['absent']} onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: /não existe/i }).className).toContain('tecla-ausente');
  });

  it('splits into one band per board when given more than one state', () => {
    const { container } = render(
      <Key letter="A" states={['correct', 'absent', 'present', 'unused']} onPress={vi.fn()} />,
    );
    expect(container.querySelectorAll('.tecla-segmento')).toHaveLength(4);
  });

  it('does not split a single-board key into bands', () => {
    const { container } = render(<Key letter="A" states={['correct']} onPress={vi.fn()} />);
    expect(container.querySelectorAll('.tecla-segmento')).toHaveLength(0);
  });

  it('vibrates briefly on a touch press when the API exists', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    render(<Key letter="A" states={['unused']} onPress={vi.fn()} />);

    fireEvent.touchStart(screen.getByRole('button', { name: 'A' }));

    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it('does not throw when navigator.vibrate is unavailable', () => {
    // Calling the exported guard directly, not through fireEvent: React's
    // dev-mode event dispatch re-throws a handler's error asynchronously
    // (to get its stack trace right), which escapes a synchronous
    // `expect(() => fireEvent...).not.toThrow()` wrapper entirely — that
    // shape of assertion would report "passed" even with the `?.` guard
    // removed and a real TypeError being thrown. Calling the guard itself
    // has no such escape hatch: a bare `navigator.vibrate(8)` throws
    // synchronously, in this call, when `navigator.vibrate` is undefined.
    expect(navigator.vibrate).toBeUndefined();
    expect(() => {
      vibrateOnTouch();
    }).not.toThrow();
  });

  it('still fires onPress on click when navigator.vibrate is unavailable', () => {
    const onPress = vi.fn();
    render(<Key letter="A" states={['unused']} onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onPress).toHaveBeenCalledWith('A');
  });

  it('gives the segmented letter a hard-stop gradient of each band\'s own fixed ink colour', () => {
    // Quarteto order: correct, absent, present, unused. Each stop repeats
    // its colour at both edges of its quarter — a hard edge, not a blend
    // into its neighbour — and every colour here is one already proven to
    // clear 4.5:1 against its own band's background in both themes (see
    // the task-17 fix report), not a new pairing invented for this key.
    const gradient = segmentedTextGradient(['correct', 'absent', 'present', 'unused']);
    expect(gradient).toBe(
      'linear-gradient(to right, ' +
        'var(--knockout) 0%, var(--knockout) 25%, ' +
        'var(--ghost) 25%, var(--ghost) 50%, ' +
        'var(--knockout) 50%, var(--knockout) 75%, ' +
        'var(--ink) 75%, var(--ink) 100%)',
    );
  });

  it('applies that gradient as the segmented letter\'s background-image, clipped to the text', () => {
    const { container } = render(
      <Key letter="A" states={['correct', 'absent', 'present', 'unused']} onPress={vi.fn()} />,
    );
    const label = container.querySelector<HTMLElement>('.tecla-multipla-letra');
    expect(label?.style.backgroundImage).toBe(segmentedTextGradient(['correct', 'absent', 'present', 'unused']));
  });

  it('does not fall back to mix-blend-mode for the segmented letter', () => {
    // Regression guard for the dropped approach: differencing one fixed
    // colour against several backgrounds measured under 1.3:1 in dark
    // mode, so this class must never carry mix-blend-mode again.
    const { container } = render(<Key letter="A" states={['correct', 'absent']} onPress={vi.fn()} />);
    const label = container.querySelector<HTMLElement>('.tecla-multipla-letra');
    expect(label?.style.mixBlendMode).toBe('');
  });
});
