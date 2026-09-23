import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendHistory } from '../../../storage/repository';
import { loadDefinition } from '../../../data/definitions';
import { HistoryModal } from '../HistoryModal';

vi.mock('../../../data/definitions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../data/definitions')>()),
  loadDefinition: vi.fn(),
}));

const mockedLoadDefinition = vi.mocked(loadDefinition);

beforeEach(() => {
  localStorage.clear();
  mockedLoadDefinition.mockReset();
  mockedLoadDefinition.mockImplementation((word: string) =>
    Promise.resolve(word === 'casal' ? 's.m. par afetivo' : null),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('HistoryModal', () => {
  it('renders nothing while closed', () => {
    render(<HistoryModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a friendly empty state with no matches yet', () => {
    render(<HistoryModal isOpen onClose={() => {}} />);
    expect(screen.getByText(/nenhuma partida/i)).toBeDefined();
  });

  it('lists a finished match with variant, mode, result and its word, most recent first', async () => {
    appendHistory({
      variant: 'solo', mode: 'diario', dayKey: '2026-09-19', won: true, attempts: 3,
      finishedAt: 1_000, answers: ['prato'],
    });
    appendHistory({
      variant: 'solo', mode: 'infinito', dayKey: null, won: true, attempts: 2,
      finishedAt: 2_000, answers: ['casal'],
    });

    render(<HistoryModal isOpen onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    // Most recent (casal, finishedAt 2000) first.
    expect(within(items[0]!).getByText('casal')).toBeDefined();
    expect(within(items[0]!).getByText(/solo/i)).toBeDefined();
    expect(within(items[0]!).getByText(/infinito/i)).toBeDefined();
    expect(within(items[0]!).getByText('2/6')).toBeDefined();

    await waitFor(() => {
      expect(within(items[0]!).getByText(/par afetivo/)).toBeDefined();
    });

    expect(within(items[1]!).getByText('prato')).toBeDefined();
  });

  it('shows every board word for a multi-board match', () => {
    appendHistory({
      variant: 'dueto', mode: 'diario', dayKey: '2026-09-20', won: false, attempts: null,
      finishedAt: 3_000, answers: ['casal', 'terra'],
    });

    render(<HistoryModal isOpen onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('casal')).toBeDefined();
    expect(within(dialog).getByText('terra')).toBeDefined();
  });

  it('shows a loss as X over the variant\'s max attempts', () => {
    appendHistory({
      variant: 'solo', mode: 'diario', dayKey: '2026-09-20', won: false, attempts: null,
      finishedAt: 4_000, answers: ['prato'],
    });

    render(<HistoryModal isOpen onClose={() => {}} />);
    expect(screen.getByText('X/6')).toBeDefined();
  });

  it('tolerates a legacy history entry saved before `answers` existed', () => {
    const legacy = {
      variant: 'solo' as const, mode: 'diario' as const, dayKey: '2026-09-18',
      won: true, attempts: 1, finishedAt: 500,
    };
    localStorage.setItem('verbete:history', JSON.stringify({ v: 1, data: [legacy] }));

    expect(() => render(<HistoryModal isOpen onClose={() => {}} />)).not.toThrow();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1);
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<HistoryModal isOpen onClose={() => { closed = true; }} />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(closed).toBe(true);
  });
});
