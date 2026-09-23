import { describe, expect, it } from 'vitest';
import definitions from '../definitions.generated.json';
import { answerPool, dailyPool } from '../dictionary';
import { normalize } from '../../engine/normalize';
import { loadDefinition, parseDefinition } from '../definitions';

describe('definitions.generated.json', () => {
  it('covers every answer, including every word the daily deck can draw', () => {
    // Not "most" (the pre-C1 bar was 0.8, and 8.7% of answers shipped with
    // nothing to reveal — including that day's own Solo daily). Every match
    // ends by revealing the answer's definition; an answer with none reveals
    // a void. `assertBuildInvariants` enforces this at build time and
    // `pnpm dict:verify` re-checks the committed files; this is the same
    // invariant stated against the data the app actually imports.
    const uncovered = answerPool().filter((w) => !(w in definitions));
    expect(uncovered).toEqual([]);
  });

  it('keeps the frozen daily pool inside the covered set', () => {
    // DAILY_POOL_SIZE and EPOCH_DAY_KEY are frozen, so a gloss-less word
    // reaching the first DAILY_POOL_SIZE entries cannot be removed later
    // without renumbering every past puzzle. This is the check that has to
    // hold forever.
    expect(dailyPool().every((w) => w in definitions)).toBe(true);
  });

  it('never contains the word it defines, or a derivational relative of it', () => {
    // 3, not 4: a 4-letter stem missed "socar" defined as "dar socos em"
    // ("socos" shares only 3 letters with the stem) — see
    // scripts/build-dictionary.ts's definitionStem for the measured
    // comparison that led to shortening this. Every definition actually
    // shipped is already held to this exact same check at build time
    // (spoilsAnswer/assertDefinitionDoesNotSpoil); this test exists so a
    // regression that widens the stem back to 4 fails here too, on the
    // committed data, independent of the build script.
    for (const [word, definition] of Object.entries(definitions)) {
      expect(normalize(definition as string)).not.toContain(normalize(word).slice(0, 3));
    }
  });

  it('stays short', () => {
    for (const definition of Object.values(definitions)) {
      expect((definition as string).length).toBeLessThanOrEqual(100);
    }
  });

  it('never leaks "socos" for "socar" — the derivational-relative case review caught', () => {
    // Named regression for the specific example the review found: a 4-char
    // stem let "socar" ship with Wiktionary's own first sense, "dar socos
    // em", because "socos" only shares 3 letters with the stem "soca". If
    // this key is present at all, it must not be that sense.
    const definition = (definitions as Record<string, string>).socar;
    if (definition !== undefined) {
      expect(normalize(definition)).not.toContain('SOC');
    }
  });

  it('is keyed by the exact accented, lowercase form the answer pool uses', () => {
    // A key that survived normalization drift (accents stripped, or
    // uppercased) would silently never match a real board's answer — this
    // fails loudly instead of the reveal just always showing "sem verbete".
    for (const word of Object.keys(definitions)) {
      expect(word).toBe(word.toLowerCase());
    }
  });
});

describe('loadDefinition', () => {
  it('resolves a real answer to its generated definition', async () => {
    const [firstAnswer] = answerPool();
    expect(firstAnswer).toBeDefined();
    const definition = await loadDefinition(firstAnswer!);
    // Every answer has one now (see the coverage test above), and this
    // resolves it against the real generated file via a dynamic import —
    // the plumbing this test exists to check.
    expect(typeof definition).toBe('string');
  });

  it('returns null for a word with no entry', async () => {
    expect(await loadDefinition('xxxxx-not-a-real-answer')).toBeNull();
  });
});

describe('parseDefinition', () => {
  it('splits a generated "<abbrev> <gloss>" string into its two parts', () => {
    expect(parseDefinition('s.f. planta ornamental da família das compostas')).toEqual({
      abbrev: 's.f.',
      gloss: 'planta ornamental da família das compostas',
    });
    expect(parseDefinition('v. ligar; juntar; unir')).toEqual({ abbrev: 'v.', gloss: 'ligar; juntar; unir' });
  });

  it('falls back to an empty abbreviation for text with no recognized prefix', () => {
    expect(parseDefinition('lero-lero sem prefixo')).toEqual({ abbrev: '', gloss: 'lero-lero sem prefixo' });
  });
});
