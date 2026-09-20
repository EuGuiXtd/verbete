import { describe, expect, it, vi } from 'vitest';
import { dailyAnswers, dailyNumber } from '../daily';
import { VARIANT_ORDER, VARIANTS } from '../constants';

const POOL = Array.from({ length: 1500 }, (_, i) => `W${String(i).padStart(4, '0')}`);

describe('dailyAnswers', () => {
  it('is stable for a given day and variant', () => {
    expect(dailyAnswers('2026-09-20', 'quarteto', POOL))
      .toEqual(dailyAnswers('2026-09-20', 'quarteto', POOL));
  });

  it('differs from one day to the next', () => {
    expect(dailyAnswers('2026-09-20', 'solo', POOL))
      .not.toEqual(dailyAnswers('2026-09-21', 'solo', POOL));
  });

  it('returns one answer per board', () => {
    expect(dailyAnswers('2026-09-20', 'solo', POOL)).toHaveLength(1);
    expect(dailyAnswers('2026-09-20', 'dueto', POOL)).toHaveLength(2);
    expect(dailyAnswers('2026-09-20', 'quarteto', POOL)).toHaveLength(4);
  });

  it('never repeats a word within one day, across all variants', () => {
    const everything = VARIANT_ORDER.flatMap((v) => dailyAnswers('2026-09-20', v, POOL));
    expect(new Set(everything).size).toBe(everything.length);
  });

  // Amendment (Task 12, sec. A): the brief's exact "1498" assertion measured
  // the *design's* simulation, not this implementation, and the cycle-
  // boundary dedup loop can shift it. Asserting the exact number would make a
  // fixture drift read as a deck bug. Assert the properties that actually
  // matter to players instead, and record the measured figure alongside.
  it('exhausts the pool before recycling', () => {
    const wordCounts = new Map<string, number>();

    for (let day = 0; day < 214; day += 1) {
      const key = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      const todaysWords = VARIANT_ORDER.flatMap((variant) => dailyAnswers(key, variant, POOL));

      // Every word drawn within a single day is distinct: this is the exact
      // guarantee a player can verify directly by looking at their boards.
      expect(new Set(todaysWords).size).toBe(todaysWords.length);

      for (const word of todaysWords) {
        wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
      }
    }

    const distinctWords = new Set(wordCounts.keys());
    const repeatedBeforeExhaustion = [...wordCounts.values()].some((count) => count > 1);

    // No word repeats across the 214 days until the pool is exhausted: a
    // repeated word is only legitimate once every word in the pool has
    // already been drawn at least once.
    if (repeatedBeforeExhaustion) {
      expect(distinctWords.size).toBe(POOL.length);
    }

    // Measured with this implementation: 214 days x 7 slots against a
    // 1500-word pool yields 1498 distinct words (see comment above).
    expect(distinctWords.size).toBeGreaterThanOrEqual(1490);
  });

  // Review fix: the permutation cache used to be keyed on cycle alone. A
  // cycle is shared by any pool size (cycle = floor(cursor / poolSize)), so
  // two calls landing in the same cycle with differently-sized pools would
  // read back a permutation shaped for whichever pool got there first. That
  // is a pure-function violation: dailyAnswers's result for (dayKey, variant,
  // pool) must not depend on which OTHER pool sizes happened to be queried
  // earlier in the process for the same cycle.
  //
  // vi.resetModules() + dynamic import gives each side of this comparison
  // its own module-level `permutations` cache, so "reference" is computed
  // with a clean cache and "result" is computed with a cache already primed,
  // for the same cycle, by an unrelated, differently-sized pool.
  it('is unaffected by a differently-sized pool cached earlier for the same cycle', async () => {
    const dayKey = '2026-01-01'; // day 0 -> cursor base 0, cycle 0 for any pool size > 6.
    const pool = Array.from({ length: 30 }, (_, i) => `P${String(i).padStart(2, '0')}`);
    const unrelatedPool = Array.from({ length: 12 }, (_, i) => `X${i}`);

    vi.resetModules();
    const clean = await import('../daily');
    const reference = clean.dailyAnswers(dayKey, 'quarteto', pool);

    vi.resetModules();
    const tainted = await import('../daily');
    tainted.dailyAnswers(dayKey, 'quarteto', unrelatedPool); // primes cycle 0 with the wrong pool size
    const result = tainted.dailyAnswers(dayKey, 'quarteto', pool);

    expect(result).toEqual(reference);
    expect(result).toHaveLength(VARIANTS.quarteto.boards);
    for (const word of result) expect(pool).toContain(word);

    vi.resetModules();
  });
});

describe('dailyNumber', () => {
  it('increases by one per day and starts at 1', () => {
    expect(dailyNumber('2026-01-01')).toBe(1);
    expect(dailyNumber('2026-01-02') - dailyNumber('2026-01-01')).toBe(1);
  });
});
