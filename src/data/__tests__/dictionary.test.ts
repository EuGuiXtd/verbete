import { describe, expect, it } from 'vitest';
import { DICTIONARY_VERSION, answerPool, dailyPool, isValidGuess, pickRandomAnswer } from '../dictionary';
import { normalize } from '../../engine/normalize';
import { DAILY_POOL_SIZE } from '../../engine/constants';

describe('isValidGuess', () => {
  it('accepts a real word and rejects nonsense', () => {
    expect(isValidGuess('CASAL')).toBe(true);
    expect(isValidGuess('XBZWK')).toBe(false);
  });

  it('accepts every answer, so no answer is unplayable', () => {
    for (const answer of answerPool()) {
      expect(isValidGuess(normalize(answer)), answer).toBe(true);
    }
  });
});

describe('pools', () => {
  it('keeps the daily pool frozen at DAILY_POOL_SIZE', () => {
    expect(dailyPool()).toHaveLength(DAILY_POOL_SIZE);
  });

  it('holds accented display forms', () => {
    // NOTE: brief's regex was uppercase-only ([ÁÂÃÀÉÊÍÓÔÕÚÇ]); the real
    // answers.generated.ts stores lowercase accented forms (e.g. "então",
    // "dália") — zero uppercase-accented entries exist in the file. Added
    // the /i flag so this checks what it means to check (diacritics
    // preserved, unlike the guess table's stripped keys) instead of
    // asserting a casing convention the generated data doesn't use.
    // See task-9-report.md for details; do not revert without confirming
    // the data's casing convention has changed.
    expect(answerPool().some((w) => /[ÁÂÃÀÉÊÍÓÔÕÚÇ]/i.test(w))).toBe(true);
  });
});

describe('DICTIONARY_VERSION', () => {
  /**
   * Independently recomputes the same FNV-1a hash `hashAnswers` in
   * scripts/build-dictionary.ts computes over `ANSWERS`, so this test fails
   * if `DICTIONARY_VERSION` is ever hand-edited, stale, or hardcoded to a
   * placeholder that happens to look like a hash — not just "is a string".
   */
  function hashAnswers(answers: readonly string[]): string {
    const input = answers.join('\u0000');
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
  }

  it('is the FNV-1a fingerprint of the exact answer pool this build shipped', () => {
    expect(DICTIONARY_VERSION).toBe(hashAnswers(answerPool()));
  });
});

describe('pickRandomAnswer', () => {
  it('never returns an excluded word', () => {
    const pool = answerPool();
    const exclude = new Set(pool.slice(0, 50));
    let rand = 0;
    const next = () => (rand = (rand + 0.017) % 1);
    for (let i = 0; i < 200; i += 1) {
      expect(exclude.has(pickRandomAnswer(exclude, next))).toBe(false);
    }
  });
});
