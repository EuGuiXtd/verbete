import { describe, expect, it } from 'vitest';
import { hashSeed, mulberry32, shuffled } from '../rng';

describe('rng', () => {
  it('produces the same stream for the same seed', () => {
    const a = mulberry32(hashSeed('verbete|cycle|0'));
    const b = mulberry32(hashSeed('verbete|cycle|0'));
    const draw = (f: () => number) => [f(), f(), f()];
    expect(draw(a)).toEqual(draw(b));
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(hashSeed('verbete|cycle|0'))();
    const b = mulberry32(hashSeed('verbete|cycle|1'))();
    expect(a).not.toBe(b);
  });

  it('stays inside [0, 1)', () => {
    const rand = mulberry32(hashSeed('x'));
    for (let i = 0; i < 1000; i += 1) {
      const value = rand();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('shuffles into a permutation without mutating the input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const out = shuffled(input, mulberry32(hashSeed('s')));
    expect([...out].sort((x, y) => x - y)).toEqual([...input]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('shuffles reproducibly', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const first = shuffled(input, mulberry32(hashSeed('s')));
    const second = shuffled(input, mulberry32(hashSeed('s')));
    expect(first).toEqual(second);
  });
});
