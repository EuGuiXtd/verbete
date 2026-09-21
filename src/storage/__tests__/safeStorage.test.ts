import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../safeStorage';
import { historyKey, progressKey, recentKey } from '../keys';

describe('createStore', () => {
  beforeEach(() => localStorage.clear());
  // Belt-and-suspenders alongside each test's own vi.restoreAllMocks() call:
  // if an assertion earlier in a test throws, that in-test restore call never
  // runs, and a Storage.prototype spy would otherwise leak into the next
  // test. This is what caught it: reordering the escalation ladder as a
  // mutation check (see the Task 14 report) made the FIRST quota test fail
  // mid-assertion, and without this hook its still-throwing setItem mock
  // then made the unrelated SECOND quota test fail too, on an assertion that
  // had nothing to do with the mutation.
  afterEach(() => vi.restoreAllMocks());

  it('round-trips a value', () => {
    const store = createStore();
    expect(store.set('k', 'v')).toBe(true);
    expect(store.get('k')).toBe('v');
    expect(store.isPersistent).toBe(true);
  });

  it('falls back to memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const store = createStore();
    expect(store.isPersistent).toBe(false);
    expect(store.set('k', 'v')).toBe(true);
    expect(store.get('k')).toBe('v');
    vi.restoreAllMocks();
  });

  it('never throws on a missing key', () => {
    expect(createStore().get('absent')).toBeNull();
  });

  // The brief describes the quota-escalation ladder in prose only:
  // "trim history to 50, then clear the recent lists, then drop finished
  // progress records, then fall back to memory — retrying after each step."
  // These two tests are not in the brief; they exist to prove the ladder
  // actually escalates in that exact order and only reaches the memory
  // fallback (with its notice) once every earlier rung has been tried.
  describe('quota escalation', () => {
    it('escalates history-trim, recent-clear and drop-finished-progress in order before giving up', () => {
      // Seed each rung with something to relieve: a history longer than 50,
      // a non-empty recent list, and a *finished* progress record.
      localStorage.setItem(
        historyKey(),
        JSON.stringify({ v: 1, data: Array.from({ length: 80 }, (_, i) => ({ i })) }),
      );
      localStorage.setItem(recentKey('solo'), JSON.stringify({ v: 1, data: ['casal', 'terra'] }));
      localStorage.setItem(
        progressKey('solo', 'diario'),
        JSON.stringify({
          v: 1,
          data: {
            variant: 'solo', mode: 'diario', dayKey: '2026-09-20',
            guesses: [], draft: '', answers: null, answersHash: 'x',
            startedAt: 1, finishedAt: 999,
          },
        }),
      );

      // Build the store BEFORE mocking setItem, so the construction-time
      // canary probe succeeds and isPersistent starts true.
      const store = createStore();
      expect(store.isPersistent).toBe(true);

      const realSetItem = Storage.prototype.setItem;
      let call = 0;
      // call 1: the original write               -> fail (forces the ladder)
      // call 2: step 1's history-trim rewrite     -> allowed, so it's inspectable
      // call 3: retry after step 1                -> fail (forces step 2)
      // call 4: retry after step 2 (clear-recent uses removeItem, no setItem call)
      //                                            -> fail (forces step 3)
      // call 5: retry after step 3 (drop-finished uses getItem/removeItem)
      //                                            -> succeed, ladder stops here
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        call += 1;
        if (call === 1 || call === 3 || call === 4) {
          throw new DOMException('quota', 'QuotaExceededError');
        }
        realSetItem.call(this, key, value);
      });

      expect(store.set(progressKey('solo', 'infinito'), 'payload')).toBe(true);

      // Step 1 ran and actually shrank history to 50.
      const history = JSON.parse(localStorage.getItem(historyKey())!) as { data: unknown[] };
      expect(history.data).toHaveLength(50);

      // Step 2 ran and cleared the solo recent list.
      expect(localStorage.getItem(recentKey('solo'))).toBeNull();

      // Step 3 ran and dropped the finished daily progress record.
      expect(localStorage.getItem(progressKey('solo', 'diario'))).toBeNull();

      // The ladder recovered before reaching the memory fallback: still
      // persistent, no notice, and the original write actually landed.
      expect(store.isPersistent).toBe(true);
      expect(store.notice).toBeNull();
      expect(store.get(progressKey('solo', 'infinito'))).toBe('payload');
      expect(call).toBe(5);

      vi.restoreAllMocks();
    });

    it('falls back to memory with a quiet pt-BR notice once every rung fails', () => {
      const store = createStore();
      expect(store.isPersistent).toBe(true);
      expect(store.notice).toBeNull();

      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });

      expect(store.set('k', 'v')).toBe(true);
      expect(store.isPersistent).toBe(false);
      expect(store.get('k')).toBe('v');
      expect(store.notice).not.toBeNull();
      // The one user-facing string this module owns must be pt-BR, not English.
      expect(store.notice).toMatch(/salv/i);

      vi.restoreAllMocks();
    });
  });
});
