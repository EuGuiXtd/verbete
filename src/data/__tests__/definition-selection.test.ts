import { describe, expect, it } from 'vitest';
import {
  assertDefinitionDoesNotSpoil,
  assertBuildInvariants,
  buildDefinition,
  type WiktionaryEntry,
} from '../../../scripts/build-dictionary';

/**
 * The C1 fix's unit-level cover. `definitions.test.ts` next door checks the
 * committed data; this checks the rule that produced it, against synthetic
 * entries, so a regression in the selection logic fails here even before
 * anyone reruns `pnpm dict:build`.
 */

function noun(word: string, ...glosses: string[]): WiktionaryEntry {
  return {
    word,
    lang_code: 'pt',
    pos: 'noun',
    tags: ['feminine'],
    senses: glosses.map((gloss) => ({ glosses: [gloss] })),
  };
}

describe('the spoiler guard still bites', () => {
  it('throws on a genuine spoiler — the real "casar" case the guard was built for', () => {
    expect(() =>
      assertDefinitionDoesNotSpoil('casar', 'ato de unir por casamento, por meio de processos jurídicos'),
    ).toThrow(/would spoil the answer/);
  });

  it('throws on a derivational relative, not just the literal word', () => {
    // "socos" is not "socar", but shares the three-letter stem — the case
    // that shortened definitionStem from 4 to 3.
    expect(() => assertDefinitionDoesNotSpoil('socar', 'dar socos em')).toThrow(/would spoil the answer/);
  });

  it('accepts a gloss that never mentions the word', () => {
    expect(() => assertDefinitionDoesNotSpoil('casar', 'ligar; juntar; unir')).not.toThrow();
  });
});

describe('buildDefinition', () => {
  it('prefers an unredacted later sense over redacting the first one', () => {
    const entry = noun('casar', 'ato de unir por casamento', 'ligar; juntar; unir');
    expect(buildDefinition('casar', [entry])).toBe('s.f. ligar; juntar; unir');
  });

  it('redacts rather than dropping a word whose every sense restates it', () => {
    // Pre-fix, this returned null and "votar" shipped with no definition at
    // all — the single biggest cause of the C1 gap (140 of 141 words).
    const entry = noun('votar', 'aprovar ou eleger por meio de voto');
    const definition = buildDefinition('votar', [entry]);
    expect(definition).toBe('s.f. aprovar ou eleger por meio de —');
    expect(() => assertDefinitionDoesNotSpoil('votar', definition!)).not.toThrow();
  });

  it('redacts the whole word, never the bare stem, so nothing leaks', () => {
    // Redacting only the three stem letters would leave "—o secreto", which
    // hands a Portuguese speaker the ending. No letter may sit against a
    // redaction mark.
    const definition = buildDefinition('votar', [
      noun('votar', 'aprovar ou eleger por meio de voto secreto'),
    ]);
    expect(definition).toBe('s.f. aprovar ou eleger por meio de — secreto');
    expect(definition).not.toMatch(/—\p{L}|\p{L}—/u);
  });

  it('refuses a redaction that leaves no content — "plural de —" is not a definition', () => {
    expect(buildDefinition('lados', [noun('lados', 'plural de lado')])).toBeNull();
  });

  it('refuses a pure cross-reference — "o mesmo que —" is not a definition', () => {
    expect(buildDefinition('bônus', [noun('bônus', 'o mesmo que bónus')])).toBeNull();
  });

  it('refuses a gloss that would need more than two redactions', () => {
    expect(
      buildDefinition('avelã', [noun('avelã', 'fruta gerada pela avelãzeira, avelaneira ou aveleira, (Corylus avellana)')]),
    ).toBeNull();
  });

  it('keeps a redacted gloss that still carries two real content words', () => {
    expect(buildDefinition('saber', [noun('saber', 'conhecimento; aquilo que se sabe')])).toBe(
      's.f. conhecimento; aquilo que se —',
    );
  });
});

describe('assertBuildInvariants', () => {
  const guesses = ['CASAL', 'VOTAR'];

  it('rejects an answer with no definition — the C1 invariant', () => {
    expect(() =>
      assertBuildInvariants(guesses, ['casal', 'votar'], { casal: 's.m. par' }),
    ).toThrow(/no definition and would reveal nothing/);
  });

  it('names the offending answers so the failure is actionable', () => {
    expect(() => assertBuildInvariants(guesses, ['casal', 'votar'], {})).toThrow(/casal, votar/);
  });
});
