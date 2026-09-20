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

  // SAMPLE above only exercises the single-byte varint path: every gap
  // between its encoded values is under 128. Real dictionary data has much
  // larger gaps (the base-26 space spans 0..11,881,375), which forces the
  // two- and three-byte LEB128 continuation-bit path in both
  // packSortedWords and unpackWords. If encoder and decoder ever disagree
  // about that path, this is what catches it — an agreement failure here
  // would otherwise surface only as the game silently rejecting real words
  // or accepting nonsense once the real word lists are packed (Task 8).
  it('round-trips a list with two- and three-byte varint gaps', () => {
    // Encoded values (base-26): AAAAA=0, ABACO=17,642 (gap 17,642 — 3
    // bytes), ABDUF=20,129 (gap 2,487 — 2 bytes), CASAL=926,131 (gap
    // 906,002 — 3 bytes), TERRA=8,764,782 (gap 7,838,651 — 4 bytes),
    // ZEBRA=11,495,822 (gap 2,731,040 — 4 bytes), ZZZZZ=11,881,375 (gap
    // 385,553 — 3 bytes, the maximum base-26 value). Every gap after the
    // first exceeds 128, so this never touches the single-byte path SAMPLE
    // already covers.
    const wideGaps = ['AAAAA', 'ABACO', 'ABDUF', 'CASAL', 'TERRA', 'ZEBRA', 'ZZZZZ'];
    const sorted = [...wideGaps].sort();
    const table = unpackWords(packSortedWords(sorted), sorted.length);
    expect([...table].map(decodeWord)).toEqual(sorted);
  });
});
