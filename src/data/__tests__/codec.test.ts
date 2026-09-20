import { describe, expect, it } from 'vitest';
import { containsWord, decodeWord, encodeWord, packSortedWords, unpackWords } from '../codec';

const SAMPLE = ['ABACO', 'CASAL', 'ERRAR', 'LICAO', 'SABIA', 'TERRA', 'ZEBRA'];

describe('word integer coding', () => {
  it('round-trips every five-letter word', () => {
    for (const word of SAMPLE) {
      expect(decodeWord(encodeWord(word))).toBe(word);
    }
  });

  it('fits in 24 bits', () => {
    expect(encodeWord('ZZZZZ')).toBeLessThan(2 ** 24);
  });

  it('preserves lexicographic order as numeric order', () => {
    expect(encodeWord('ABACO')).toBeLessThan(encodeWord('CASAL'));
  });
});

describe('packing', () => {
  it('round-trips a sorted list exactly', () => {
    const sorted = [...SAMPLE].sort();
    const table = unpackWords(packSortedWords(sorted), sorted.length);
    expect([...table].map(decodeWord)).toEqual(sorted);
  });

  it('answers membership by binary search', () => {
    const sorted = [...SAMPLE].sort();
    const table = unpackWords(packSortedWords(sorted), sorted.length);
    expect(containsWord(table, 'LICAO')).toBe(true);
    expect(containsWord(table, 'ZEBRA')).toBe(true);
    expect(containsWord(table, 'ABACO')).toBe(true);
    expect(containsWord(table, 'XXXXX')).toBe(false);
  });
});
