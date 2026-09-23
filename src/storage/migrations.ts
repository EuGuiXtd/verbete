import { corruptKey } from './keys';
import { CURRENT_VERSION } from './schema';
import type { Envelope } from './schema';
import type { KeyValueStore } from './safeStorage';

/** Transforms the data payload from version `v` to version `v + 1`. */
type Migration = (data: unknown) => unknown;

/**
 * No migrations exist yet: CURRENT_VERSION is 1, the first shipped version,
 * so there is nothing to walk forward from. Add MIGRATIONS[1] the day
 * CURRENT_VERSION becomes 2, and so on — each entry migrates from its own
 * key's version to the next.
 */
const MIGRATIONS: Record<number, Migration> = {};

/** At most this many quarantined copies are kept per slice; oldest first out. */
const MAX_QUARANTINE_PER_SLICE = 3;

function isEnvelope(value: unknown): value is { v: number; data: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    typeof (value as Record<string, unknown>).v === 'number'
  );
}

/**
 * Reads and migrates one slice. Never throws: bad JSON, a version newer than
 * CURRENT_VERSION, an unexpected shape, or a missing migration step are all
 * treated the same way — the raw value is quarantined and null is returned.
 * A broken slice must not stop the game from being playable; the caller
 * always gets either a valid T or null, never an exception.
 */
export function readSlice<T>(store: KeyValueStore, key: string, slice: string): T | null {
  const raw = store.get(key);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isEnvelope(parsed)) throw new Error('not an envelope');
    if (parsed.v > CURRENT_VERSION) throw new Error('payload is from a future version');

    let version = parsed.v;
    let data = parsed.data;
    while (version < CURRENT_VERSION) {
      const step = MIGRATIONS[version];
      if (!step) throw new Error(`no migration registered from version ${version}`);
      data = step(data);
      version += 1;
    }
    return data as T;
  } catch {
    quarantine(store, key, slice, raw);
    return null;
  }
}

/** Wraps `data` at CURRENT_VERSION and writes it through the store. */
export function writeSlice<T>(store: KeyValueStore, key: string, data: T): boolean {
  const envelope: Envelope<T> = { v: CURRENT_VERSION, data };
  return store.set(key, JSON.stringify(envelope));
}

function quarantine(store: KeyValueStore, key: string, slice: string, raw: string): void {
  store.remove(key);
  store.set(corruptKey(slice, Date.now()), raw);
  pruneQuarantine(store, slice);
}

function pruneQuarantine(store: KeyValueStore, slice: string): void {
  const prefix = `verbete:corrupt:${slice}:`;
  const entries = store
    .keys()
    .filter((k) => k.startsWith(prefix))
    .map((k) => ({ key: k, stamp: Number(k.slice(prefix.length)) }))
    .sort((a, b) => a.stamp - b.stamp);

  while (entries.length > MAX_QUARANTINE_PER_SLICE) {
    const oldest = entries.shift();
    if (!oldest) break;
    store.remove(oldest.key);
  }
}
