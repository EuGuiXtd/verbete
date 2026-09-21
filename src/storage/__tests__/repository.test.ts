import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProgress, loadStats, saveProgress, saveStats } from '../repository';
import { emptyStats } from '../../engine/stats';
import { progressKey } from '../keys';
import { computeAnswersHash } from '../schema';

describe('repository', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips progress', () => {
    const record = {
      variant: 'solo' as const, mode: 'infinito' as const, dayKey: null,
      guesses: ['CASAL'], draft: 'TE', answers: ['PRAIA'],
      answersHash: 'abc', startedAt: 10,
    };
    saveProgress(record);
    expect(loadProgress('solo', 'infinito')).toEqual(record);
  });

  it('keeps each variant and mode apart', () => {
    saveStats('solo', 'diario', { ...emptyStats(), played: 5 });
    expect(loadStats('solo', 'diario').played).toBe(5);
    expect(loadStats('solo', 'infinito').played).toBe(0);
    expect(loadStats('dueto', 'diario').played).toBe(0);
  });

  it('quarantines corrupt data and returns a fresh value', () => {
    localStorage.setItem(progressKey('solo', 'diario'), '{ not json');
    expect(loadProgress('solo', 'diario')).toBeNull();
    const quarantined = Object.keys(localStorage).filter((k) => k.startsWith('verbete:corrupt:'));
    expect(quarantined).toHaveLength(1);
  });

  it('discards a payload from a future version rather than guessing', () => {
    localStorage.setItem(progressKey('solo', 'diario'), JSON.stringify({ v: 999, data: {} }));
    expect(loadProgress('solo', 'diario')).toBeNull();
  });

  // The three additions below are not in the brief. They exercise behaviour
  // the brief only describes in prose: the three-file quarantine cap (with
  // pruning of the OLDEST copies, not an arbitrary subset), that a payload
  // from the future is quarantined (not just discarded) like any other
  // corruption, and that a daily record's answersHash round-trips exactly as
  // given — storage must not "helpfully" validate or clear it, since that
  // judgement belongs to whoever re-derives the day's answers, not to the
  // storage layer.

  it('keeps at most three quarantined copies per slice, pruning the oldest first', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    for (let i = 0; i < 5; i += 1) {
      localStorage.setItem(progressKey('solo', 'diario'), `not json #${i}`);
      expect(loadProgress('solo', 'diario')).toBeNull();
      now += 1;
    }

    const quarantined = Object.keys(localStorage)
      .filter((k) => k.startsWith('verbete:corrupt:progress:solo:diario:'))
      .sort();
    expect(quarantined).toEqual([
      'verbete:corrupt:progress:solo:diario:1002',
      'verbete:corrupt:progress:solo:diario:1003',
      'verbete:corrupt:progress:solo:diario:1004',
    ]);

    vi.restoreAllMocks();
  });

  it('quarantines a future-version payload too, not just a bare discard', () => {
    localStorage.setItem(progressKey('solo', 'diario'), JSON.stringify({ v: 999, data: {} }));
    expect(loadProgress('solo', 'diario')).toBeNull();
    const quarantined = Object.keys(localStorage).filter((k) => k.startsWith('verbete:corrupt:'));
    expect(quarantined).toHaveLength(1);
  });

  it('round-trips a daily progress record\'s answersHash exactly, even one that no longer matches', () => {
    // dayKey is set, so answers is null (re-derivable); answersHash is
    // whatever the caller computed at save time. Storage has no way to know
    // whether this hash still matches the current word list — and must not
    // try. It only has to hand back exactly what was stored.
    const record = {
      variant: 'solo' as const, mode: 'diario' as const, dayKey: '2026-09-20',
      guesses: ['CASAL'], draft: '', answers: null,
      answersHash: 'stale-hash-from-a-previous-deploy', startedAt: 10,
    };
    saveProgress(record);
    const loaded = loadProgress('solo', 'diario');
    expect(loaded).toEqual(record);
    // Specifically: the hash itself is untouched, not cleared or recomputed.
    expect(loaded?.answersHash).toBe('stale-hash-from-a-previous-deploy');
  });

  describe('computeAnswersHash', () => {
    it('is deterministic for the same answers', () => {
      expect(computeAnswersHash(['casal', 'terra'])).toBe(computeAnswersHash(['casal', 'terra']));
    });

    it('changes when a single answer changes — the exact case a deploy triggers', () => {
      expect(computeAnswersHash(['casal', 'terra'])).not.toBe(computeAnswersHash(['casal', 'praia']));
    });

    it('is sensitive to order, not just content', () => {
      expect(computeAnswersHash(['casal', 'terra'])).not.toBe(computeAnswersHash(['terra', 'casal']));
    });
  });
});
