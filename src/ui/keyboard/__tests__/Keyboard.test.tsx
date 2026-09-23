import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Keyboard } from '../Keyboard';
import type { KeyState } from '../../../engine/keyboard';

const noState = new Map<string, readonly ['unused']>();

afterEach(() => {
  cleanup();
});

describe('Keyboard', () => {
  it('reports the letter that was pressed', async () => {
    const onKey = vi.fn();
    render(<Keyboard states={noState} boardCount={1} onKey={onKey} onEnter={vi.fn()} onBackspace={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onKey).toHaveBeenCalledWith('A');
  });

  it('offers no cedilla key', () => {
    render(<Keyboard states={noState} boardCount={1} onKey={vi.fn()} onEnter={vi.fn()} onBackspace={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Ç' })).toBeNull();
  });

  it('labels a key with its state', () => {
    const states = new Map([['A', ['correct'] as const]]);
    render(<Keyboard states={states} boardCount={1} onKey={vi.fn()} onEnter={vi.fn()} onBackspace={vi.fn()} />);
    expect(screen.getByRole('button', { name: /A.*posição correta/i })).toBeDefined();
  });

  it('renders exactly the 26 letters plus a submit and a backspace key', () => {
    render(<Keyboard states={noState} boardCount={1} onKey={vi.fn()} onEnter={vi.fn()} onBackspace={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(28);
  });

  it('wires the appended submit and backspace keys to their own handlers', async () => {
    const onEnter = vi.fn();
    const onBackspace = vi.fn();
    render(<Keyboard states={noState} boardCount={1} onKey={vi.fn()} onEnter={onEnter} onBackspace={onBackspace} />);

    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await userEvent.click(screen.getByRole('button', { name: /apagar/i }));

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onBackspace).toHaveBeenCalledTimes(1);
  });

  it('splits a key into one band per board and names every board in the label', () => {
    // Quarteto: four boards, four independent states on the same letter.
    const states = new Map<string, readonly KeyState[]>([['A', ['correct', 'absent', 'present', 'unused']]]);
    render(<Keyboard states={states} boardCount={4} onKey={vi.fn()} onEnter={vi.fn()} onBackspace={vi.fn()} />);

    const key = screen.getByRole('button', {
      name: /A.*tabuleiro 1.*tabuleiro 2.*tabuleiro 3.*tabuleiro 4/is,
    });
    expect(key).toBeDefined();
  });
});
