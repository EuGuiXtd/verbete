import { describe, expect, it } from 'vitest';
import { isTypeable, normalize, toNfc } from '../normalize';

describe('normalize', () => {
  it.each([
    ['Lição', 'LICAO'],
    ['avião', 'AVIAO'],
    ['águia', 'AGUIA'],
    ['vocês', 'VOCES'],
    ['açude', 'ACUDE'],
    ['nação', 'NACAO'],
    ['sabiá', 'SABIA'],
    ['sábia', 'SABIA'],
    ['sabia', 'SABIA'],
  ])('%s becomes %s', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('strips the cedilla, which NFD decomposes like any other diacritic', () => {
    expect('ç'.normalize('NFD')).toHaveLength(2);
    expect(normalize('ç')).toBe('C');
  });

  it('is idempotent', () => {
    expect(normalize(normalize('Lição'))).toBe(normalize('Lição'));
  });

  it('always yields A-Z only', () => {
    expect(normalize('coração')).toMatch(/^[A-Z]+$/);
  });
});

describe('toNfc', () => {
  it('recomposes so length counts graphemes, not code points', () => {
    const decomposed = 'maçã'.normalize('NFD');
    expect(decomposed).toHaveLength(6);
    expect(toNfc(decomposed)).toHaveLength(4);
  });
});

describe('isTypeable', () => {
  it('accepts five plain capitals', () => {
    expect(isTypeable('LICAO', 5)).toBe(true);
  });

  it('rejects the wrong length, accents and non-letters', () => {
    expect(isTypeable('LICA', 5)).toBe(false);
    expect(isTypeable('LIÇÃO', 5)).toBe(false);
    expect(isTypeable('LIC-O', 5)).toBe(false);
  });
});
