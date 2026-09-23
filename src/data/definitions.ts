/**
 * The dictionary-definition reveal's data layer. Everything here reads
 * `definitions.generated.json` (produced by `pnpm dict:build` — see
 * `scripts/build-dictionary.ts`), a CC BY-SA 4.0 derivative of Wikcionário
 * content: one sense selected per word and shortened to fit the result
 * screen. See NOTICE.md for the full licence block.
 */

let cache: Record<string, string> | null = null;

/**
 * Resolves `word`'s generated definition, or `null` if it has none — either
 * because Wiktionary had nothing usable for it, or because every candidate
 * gloss would have spoiled the answer (see `assertDefinitionDoesNotSpoil` in
 * `scripts/build-dictionary.ts`). Never throws for a missing word: a match
 * ending on a word with no definition is exactly as valid as one that has
 * one, just quieter at the reveal.
 *
 * A dynamic import keeps the ~35 KB (gzipped) definitions payload out of the
 * initial bundle — the player needs at most one definition per match, and
 * only at the end. The module-level `cache` means the import only actually
 * runs once per page load; every definition after the first is a plain
 * object lookup. The service worker (a later task) precaches this chunk by
 * its build-time hashed filename so offline play still gets it — see this
 * task's report for what that later task needs to do.
 */
export async function loadDefinition(word: string): Promise<string | null> {
  cache ??= (await import('./definitions.generated.json')).default as Record<string, string>;
  return cache[word] ?? null;
}

export interface ParsedDefinition {
  /** The part-of-speech abbreviation ("s.f.", "adj.", "v.", ...), or "" when the generated entry carried none. */
  readonly abbrev: string;
  /** The gloss itself, with the abbreviation (and the one space after it) removed. */
  readonly gloss: string;
}

/**
 * Every value in definitions.generated.json is rendered as
 * `"<abbrev> <gloss>"` by `posAbbreviation`/`buildDefinition` in
 * scripts/build-dictionary.ts — a single generated string, not a structured
 * object, so the file stays a flat `Record<string, string>` (the shape
 * src/data/__tests__/definitions.test.ts checks directly). This is where
 * that convention is undone for display: `ResultModal` wants the
 * abbreviation and the gloss as two separate pieces of type, the way a
 * printed dictionary entry sets them (a small italic tag, then the
 * definition proper), not run together as one string.
 */
export function parseDefinition(raw: string): ParsedDefinition {
  const spaceIndex = raw.indexOf(' ');
  if (spaceIndex === -1) return { abbrev: '', gloss: raw };

  const candidate = raw.slice(0, spaceIndex);
  if (!/^(s\.2g\.|s\.m\.|s\.f\.|s\.|adj\.|adv\.|v\.)$/.test(candidate)) {
    return { abbrev: '', gloss: raw };
  }
  return { abbrev: candidate, gloss: raw.slice(spaceIndex + 1) };
}
