import { useEffect, useRef } from 'react';
import { dayKeyOf, msUntilNextMidnight } from '../engine/clock';

/**
 * Detects the Sao Paulo calendar day changing while the app stays open, and
 * calls `onNewDay` once per day change with the new day key. Three
 * independent triggers, because each one alone leaves a real gap:
 *
 * - a `setTimeout` armed for the next midnight: fires even if the tab never
 *   receives another event, but does not survive the device sleeping
 *   through its own deadline (a suspended timer does not fire late on
 *   resume — it simply never fires).
 * - `visibilitychange`: catches the day having turned over while the tab
 *   was hidden or the device was asleep, the moment the tab is shown again.
 * - `focus`: covers the same gap as `visibilitychange` for a tab that
 *   stayed visible on screen the whole time but whose window/OS focus
 *   lapsed and returned without a visibility transition (common on
 *   desktop when switching apps).
 *
 * All three funnel through the same `check`, which is the only place that
 * compares today's day key against the last one seen and calls `onNewDay` —
 * so whichever trigger fires first wins and the other two become no-ops for
 * that day change.
 *
 * `onNewDay` is read through a ref, not a `useEffect` dependency: the
 * effect below only ever needs to run once per mount (there is nothing in
 * it that depends on props), so a caller passing a fresh arrow function
 * every render — as MatchProvider effectively could — does not tear down
 * and rearm the midnight timer and the two listeners on every render.
 */
export function useDailyRollover(onNewDay: (dayKey: string) => void): void {
  const dayKeyRef = useRef(dayKeyOf(Date.now()));
  const onNewDayRef = useRef(onNewDay);
  onNewDayRef.current = onNewDay;

  useEffect(() => {
    const check = () => {
      const current = dayKeyOf(Date.now());
      if (current !== dayKeyRef.current) {
        dayKeyRef.current = current;
        onNewDayRef.current(current);
      }
    };

    const timer = setTimeout(check, msUntilNextMidnight(Date.now()) + 1000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
}
