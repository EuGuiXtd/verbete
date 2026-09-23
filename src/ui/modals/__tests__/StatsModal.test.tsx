import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyStats } from '../../../engine/stats';
import { appendHistory, saveStats } from '../../../storage/repository';
import { StatsModal } from '../StatsModal';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('StatsModal', () => {
  it('renders nothing while closed', () => {
    render(<StatsModal isOpen={false} onClose={() => {}} onOpenHistory={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows games, win rate, streak and best streak for the default (Solo/Diário) selection', () => {
    saveStats('solo', 'diario', {
      ...emptyStats(),
      played: 10,
      wins: 7,
      streak: 3,
      bestStreak: 5,
      distribution: { 2: 1, 3: 2, 4: 4 },
    });

    render(<StatsModal isOpen onClose={() => {}} onOpenHistory={() => {}} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('stat-jogadas').textContent).toBe('10');
    expect(within(dialog).getByTestId('stat-vitorias').textContent).toBe('70%');
    expect(within(dialog).getByTestId('stat-sequencia').textContent).toBe('3');
    expect(within(dialog).getByTestId('stat-melhor-sequencia').textContent).toBe('5');
  });

  it('hides the streak entirely for Infinito — an always-zero streak would look broken there', () => {
    saveStats('solo', 'infinito', { ...emptyStats(), played: 4, wins: 2 });
    render(<StatsModal isOpen onClose={() => {}} onOpenHistory={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Infinito' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/sequência/i)).toBeNull();
  });

  it('follows the selector when variant or mode changes', () => {
    saveStats('solo', 'diario', { ...emptyStats(), played: 1 });
    saveStats('dueto', 'diario', { ...emptyStats(), played: 9 });
    render(<StatsModal isOpen onClose={() => {}} onOpenHistory={() => {}} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('stat-jogadas').textContent).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Dueto' }));
    expect(within(dialog).getByTestId('stat-jogadas').textContent).toBe('9');
  });

  it('renders one distribution bar per possible attempt count for the selected variant', () => {
    saveStats('solo', 'diario', { ...emptyStats(), played: 6, wins: 6, distribution: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 } });
    render(<StatsModal isOpen onClose={() => {}} onOpenHistory={() => {}} />);

    const dialog = screen.getByRole('dialog');
    // Solo plays 6 attempts max.
    const labels = within(dialog).getAllByTestId('distribuicao-rotulo').map((el) => el.textContent);
    expect(labels).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it("highlights the distribution bar for the most recently played match's attempt count", () => {
    saveStats('solo', 'diario', { ...emptyStats(), played: 2, wins: 2, distribution: { 2: 1, 4: 1 } });
    appendHistory({
      variant: 'solo', mode: 'diario', dayKey: '2026-09-19', won: true, attempts: 2,
      finishedAt: 1000, answers: ['casal'],
    });
    appendHistory({
      variant: 'solo', mode: 'diario', dayKey: '2026-09-20', won: true, attempts: 4,
      finishedAt: 2000, answers: ['prato'],
    });

    render(<StatsModal isOpen onClose={() => {}} onOpenHistory={() => {}} />);

    const dialog = screen.getByRole('dialog');
    const highlighted = within(dialog).getByTestId('distribuicao-recente');
    expect(highlighted.textContent).toContain('4');
  });

  it('calls onOpenHistory when its history control is used', () => {
    let opened = false;
    render(<StatsModal isOpen onClose={() => {}} onOpenHistory={() => { opened = true; }} />);

    fireEvent.click(screen.getByRole('button', { name: /histórico/i }));
    expect(opened).toBe(true);
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<StatsModal isOpen onClose={() => { closed = true; }} onOpenHistory={() => {}} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(true);
  });
});
