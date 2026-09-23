import { describe, expect, it } from 'vitest';
import { areConsecutive, dayKeyOf, epochDayOf, msUntilNextMidnight } from '../clock';

// 2026-09-20T02:00:00Z is 2026-09-19 23:00 in Sao Paulo — still "yesterday".
const UTC_EARLY_MORNING = Date.UTC(2026, 8, 20, 2, 0, 0);
const UTC_MIDDAY = Date.UTC(2026, 8, 20, 15, 0, 0);

describe('dayKeyOf', () => {
  it('uses the Sao Paulo calendar day, not UTC', () => {
    expect(dayKeyOf(UTC_EARLY_MORNING)).toBe('2026-09-19');
    expect(dayKeyOf(UTC_MIDDAY)).toBe('2026-09-20');
  });

  it('formats as YYYY-MM-DD', () => {
    expect(dayKeyOf(UTC_MIDDAY)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('epochDayOf', () => {
  it('counts whole days from the origin and increases by one per day', () => {
    expect(epochDayOf('2026-09-20') - epochDayOf('2026-09-19')).toBe(1);
  });

  it('crosses month and year boundaries by exactly one', () => {
    expect(epochDayOf('2026-10-01') - epochDayOf('2026-09-30')).toBe(1);
    expect(epochDayOf('2027-01-01') - epochDayOf('2026-12-31')).toBe(1);
  });
});

describe('msUntilNextMidnight', () => {
  it('returns a positive span under 24 hours', () => {
    const ms = msUntilNextMidnight(UTC_MIDDAY);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('lands on the next Sao Paulo day', () => {
    const ms = msUntilNextMidnight(UTC_MIDDAY);
    expect(dayKeyOf(UTC_MIDDAY + ms)).toBe('2026-09-21');
    expect(dayKeyOf(UTC_MIDDAY + ms - 1000)).toBe('2026-09-20');
  });
});

describe('areConsecutive', () => {
  it('is true only for adjacent days, in order', () => {
    expect(areConsecutive('2026-09-19', '2026-09-20')).toBe(true);
    expect(areConsecutive('2026-09-19', '2026-09-21')).toBe(false);
    expect(areConsecutive('2026-09-20', '2026-09-19')).toBe(false);
    expect(areConsecutive('2026-09-20', '2026-09-20')).toBe(false);
  });
});
