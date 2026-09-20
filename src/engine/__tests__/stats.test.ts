import { describe, expect, it } from 'vitest';
import { applyResult, emptyStats, winRate } from '../stats';

const won = (dayKey: string | null, attempts: number) =>
  ({ won: true, attempts, dayKey, mode: dayKey ? 'diario' : 'infinito' }) as const;
const lost = (dayKey: string | null) =>
  ({ won: false, attempts: null, dayKey, mode: dayKey ? 'diario' : 'infinito' }) as const;

describe('applyResult', () => {
  it('counts games and wins', () => {
    let stats = applyResult(emptyStats(), won('2026-09-20', 3));
    stats = applyResult(stats, lost('2026-09-21'));
    expect(stats.played).toBe(2);
    expect(stats.wins).toBe(1);
    expect(winRate(stats)).toBe(50);
  });

  it('fills the attempt distribution', () => {
    const stats = applyResult(emptyStats(), won('2026-09-20', 3));
    expect(stats.distribution[3]).toBe(1);
  });

  it('extends the streak on consecutive days', () => {
    let stats = applyResult(emptyStats(), won('2026-09-19', 4));
    stats = applyResult(stats, won('2026-09-20', 2));
    expect(stats.streak).toBe(2);
    expect(stats.bestStreak).toBe(2);
  });

  it('resets the streak on a gap, keeping the best', () => {
    let stats = applyResult(emptyStats(), won('2026-09-19', 4));
    stats = applyResult(stats, won('2026-09-20', 2));
    stats = applyResult(stats, won('2026-09-25', 5));
    expect(stats.streak).toBe(1);
    expect(stats.bestStreak).toBe(2);
  });

  it('breaks the streak on a loss', () => {
    let stats = applyResult(emptyStats(), won('2026-09-19', 4));
    stats = applyResult(stats, lost('2026-09-20'));
    expect(stats.streak).toBe(0);
  });

  it('never lets infinite mode touch the streak', () => {
    let stats = applyResult(emptyStats(), won('2026-09-19', 4));
    stats = applyResult(stats, won(null, 2));
    expect(stats.streak).toBe(1);
    expect(stats.played).toBe(2);
  });

  // The two cases above only ever exercise `mode` and `dayKey` moving
  // together (the `won`/`lost` helpers couple them), so the guard
  // `result.mode !== 'diario' || result.dayKey === null` has never been
  // pinned to a single clause. Constructed directly, not through the
  // helpers, so each case isolates one clause.
  it('does not touch the streak when mode is infinito even with a real dayKey', () => {
    let stats = applyResult(emptyStats(), won('2026-09-19', 4));
    stats = applyResult(stats, { won: true, attempts: 2, dayKey: '2026-09-20', mode: 'infinito' });
    expect(stats.streak).toBe(1);
  });

  it('does not touch the streak when dayKey is null even with mode diario', () => {
    let stats = applyResult(emptyStats(), won('2026-09-19', 4));
    stats = applyResult(stats, { won: true, attempts: 2, dayKey: null, mode: 'diario' });
    expect(stats.streak).toBe(1);
  });
});
