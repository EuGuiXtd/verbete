import { EPOCH_DAY_KEY, TIME_ZONE } from './constants';

const MS_PER_DAY = 86_400_000;

// "en-CA" formats as YYYY-MM-DD, which saves reassembling the parts by hand.
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function dayKeyOf(nowMs: number): string {
  return DAY_FORMAT.format(nowMs);
}

/**
 * Days since EPOCH_DAY_KEY. Parsing the key as UTC midnight is safe precisely
 * because the key already carries the Sao Paulo calendar date — we are doing
 * calendar arithmetic, not instant arithmetic, so no offset applies.
 */
export function epochDayOf(dayKey: string): number {
  return Math.round((asUtcMidnight(dayKey) - asUtcMidnight(EPOCH_DAY_KEY)) / MS_PER_DAY);
}

export function msUntilNextMidnight(nowMs: number): number {
  const today = dayKeyOf(nowMs);
  // 25 hours ahead is past the boundary whatever the offset, so it brackets it.
  // Binary search rather than a scan: exact, ~35 iterations, and it assumes
  // nothing about the UTC offset. Brazil dropped DST in 2019, but that is a
  // political decision and Intl tracks the tzdata, so never hardcode -03:00.
  let before = nowMs;
  let after = nowMs + 25 * 60 * 60 * 1000;
  while (after - before > 1) {
    const mid = before + Math.floor((after - before) / 2);
    if (dayKeyOf(mid) === today) before = mid;
    else after = mid;
  }
  return after - nowMs;
}

export function areConsecutive(earlier: string, later: string): boolean {
  return epochDayOf(later) - epochDayOf(earlier) === 1;
}

function asUtcMidnight(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}