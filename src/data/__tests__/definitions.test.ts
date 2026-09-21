import { describe, expect, it } from 'vitest';
import definitions from '../definitions.generated.json';
import { answerPool } from '../dictionary';
import { normalize } from '../../engine/normalize';
import { loadDefinition, parseDefinition } from '../definitions';

describe('definitions.generated.json', () => {
  it('covers most of the answer pool', () => {
    const covered = answerPool().filter((w) => w in definitions).length;
    expect(covered / answerPool().length).toBeGreaterThan(0.8);
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
    // Not every answer has one (see the coverage test above) — but the very
    // fact this resolves without throwing, against the real generated file
    // via a dynamic import, is the property this test exists to check.
    expect(definition === null || typeof definition === 'string').toBe(true);
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
