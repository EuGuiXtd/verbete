import type { Mode, Variant } from '../engine/types';
import { emptyStats, type StatsRecord } from '../engine/stats';
import { historyKey, prefsKey, progressKey, recentKey, statsKey } from './keys';
import { readSlice, writeSlice } from './migrations';
import { createStore } from './safeStorage';
import type { HistoryEntry, PrefsRecord, ProgressRecord } from './schema';

// One store for the whole module: safeStorage's canary probe only needs to
// run once per session, and every slice shares the same quota-escalation
// ladder (it reasons about ALL of history/recent/progress at once, not just
// the key currently being written).
const store = createStore();

const DEFAULT_PREFS: PrefsRecord = {
  colorBlindMode: false,
  reduceMotion: false,
  hardMode: false,
  theme: 'system',
  // A genuinely first visit opens on the daily, which is what the product
  // is for — not on an infinite match nobody asked for.
  lastVariant: 'solo',
  lastMode: 'diario',
};

export function loadProgress(variant: Variant, mode: Mode): ProgressRecord | null {
  return readSlice<ProgressRecord>(store, progressKey(variant, mode), `progress:${variant}:${mode}`);
}

export function saveProgress(record: ProgressRecord): boolean {
  return writeSlice(store, progressKey(record.variant, record.mode), record);
}

export function loadStats(variant: Variant, mode: Mode): StatsRecord {
  return readSlice<StatsRecord>(store, statsKey(variant, mode), `stats:${variant}:${mode}`) ?? emptyStats();
}

export function saveStats(variant: Variant, mode: Mode, stats: StatsRecord): boolean {
  return writeSlice(store, statsKey(variant, mode), stats);
}

/**
 * Merges what was stored over the defaults rather than returning it whole.
 * Prefs is the one slice that grows field by field as settings get added, and
 * a record written before a field existed would otherwise come back with that
 * field `undefined` while TypeScript insisted it was present. Merging makes
 * adding a preference a non-event; it does NOT validate the values that are
 * there, so a reader that cares about a specific field still guards it.
 */
export function loadPrefs(): PrefsRecord {
  const stored = readSlice<Partial<PrefsRecord>>(store, prefsKey(), 'prefs');
  return stored === null ? DEFAULT_PREFS : { ...DEFAULT_PREFS, ...stored };
}

export function savePrefs(prefs: PrefsRecord): boolean {
  return writeSlice(store, prefsKey(), prefs);
}

export function appendHistory(entry: HistoryEntry): boolean {
  const existing = loadHistory();
  return writeSlice(store, historyKey(), [...existing, entry]);
}

export function loadHistory(): readonly HistoryEntry[] {
  return readSlice<readonly HistoryEntry[]>(store, historyKey(), 'history') ?? [];
}

/**
 * How many recent infinite answers to remember per variant. Large enough that
 * a session's worth of play never repeats, small enough that it stays a tiny
 * fraction of the answer pool — `pickRandomAnswer` samples against this set,
 * and an exclusion list approaching the pool size would make it thrash and
 * then fall back to the full pool anyway.
 */
const RECENT_LIMIT = 100;

export function loadRecent(variant: Variant): readonly string[] {
  const stored = readSlice<readonly string[]>(store, recentKey(variant), `recent:${variant}`) ?? [];
  // Unvalidated like every other slice (see loadPrefs): a hand-edited or
  // corrupt record must not reach `pickRandomAnswer`'s exclusion set as
  // something that is not an array of strings.
  return Array.isArray(stored) ? stored.filter((word) => typeof word === 'string') : [];
}

export function saveRecent(variant: Variant, words: readonly string[]): boolean {
  return writeSlice(store, recentKey(variant), words);
}

/**
 * Appends `answers` to `variant`'s recent list, oldest first out, without
 * duplicating a word already in it. Idempotent: calling it twice with the
 * same answers leaves the same list, which is what lets the caller be a plain
 * effect rather than something that has to fire exactly once.
 *
 * This is what makes `verbete:recent:*` a key that actually exists. Until the
 * final review (I7) nothing wrote it, which quietly made `clearRecent` — the
 * middle rung of `safeStorage`'s quota-recovery ladder — free zero bytes, and
 * left infinite mode repeating words across sessions even though the storage
 * layer had been built to stop exactly that.
 */
export function rememberRecent(variant: Variant, answers: readonly string[]): boolean {
  const fresh = new Set(answers);
  const merged = [...loadRecent(variant).filter((word) => !fresh.has(word)), ...answers];
  return saveRecent(variant, merged.slice(-RECENT_LIMIT));
}
