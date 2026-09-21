import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadStats } from '../../storage/repository';
import { useStats } from '../useStats';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('useStats', () => {
  it('getStats reads emptyStats() before anything has been recorded', () => {
    const { result } = renderHook(() => useStats());

    expect(result.current.getStats('solo', 'infinito')).toEqual({
      played: 0, wins: 0, streak: 0, bestStreak: 0, lastWinDayKey: null, distribution: {},
    });
  });

  it('recordResult writes through the repository, not just to memory', () => {
    const { result } = renderHook(() => useStats());

    act(() => {
      result.current.recordResult('solo', 'infinito', { won: true, attempts: 3, dayKey: null, mode: 'infinito' });
    });

    // Read via a second, independent hook instance — proves this landed in
    // storage, not in some local state private to the first instance.
    const { result: second } = renderHook(() => useStats());
    expect(second.current.getStats('solo', 'infinito')).toEqual(loadStats('solo', 'infinito'));
    expect(second.current.getStats('solo', 'infinito').played).toBe(1);
    expect(second.current.getStats('solo', 'infinito').wins).toBe(1);
    expect(second.current.getStats('solo', 'infinito').distribution).toEqual({ 3: 1 });
  });

  it('keeps a losing result out of the win count and distribution', () => {
    const { result } = renderHook(() => useStats());

    act(() => {
      result.current.recordResult('solo', 'infinito', { won: false, attempts: null, dayKey: null, mode: 'infinito' });
    });

    const stats = result.current.getStats('solo', 'infinito');
    expect(stats.played).toBe(1);
    expect(stats.wins).toBe(0);
    expect(stats.distribution).toEqual({});
  });

  it('advances a daily streak across consecutive wins and returns the updated record', () => {
    const { result } = renderHook(() => useStats());

    let updated = result.current.recordResult('solo', 'diario', {
      won: true, attempts: 2, dayKey: '2026-09-20', mode: 'diario',
    });
    expect(updated.streak).toBe(1);

    act(() => {
      updated = result.current.recordResult('solo', 'diario', {
        won: true, attempts: 4, dayKey: '2026-09-21', mode: 'diario',
      });
    });
    expect(updated.streak).toBe(2);
    expect(updated.bestStreak).toBe(2);
  });

  it('keeps each variant and mode apart', () => {
    const { result } = renderHook(() => useStats());

    act(() => {
      result.current.recordResult('solo', 'diario', { won: true, attempts: 1, dayKey: '2026-09-20', mode: 'diario' });
    });

    expect(result.current.getStats('solo', 'infinito').played).toBe(0);
    expect(result.current.getStats('dueto', 'diario').played).toBe(0);
    expect(result.current.getStats('solo', 'diario').played).toBe(1);
  });
});
