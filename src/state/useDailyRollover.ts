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
 *
 * The timer re-arms itself every time `check` runs, not just once at
 * mount: `msUntilNextMidnight(Date.now())` is recomputed and a fresh
 * `setTimeout` scheduled on every call, whether `check` was invoked by the
 * timer firing or by `visibilitychange`/`focus`. Firing it only once would
 * quietly reduce this to a two-trigger design after the first night —
 * exactly the gap neither `visibilitychange` nor `focus` covers: a tab
 * that stays continuously visible and focused straight through every
 * later midnight (a kiosk display, a desktop player who never alt-tabs)
 * would get no timer contribution at all past day one. `timer` is
 * cleared before every re-arm, including inside `check` itself — not just
 * on unmount — so an early trigger (visibilitychange/focus firing before
 * the scheduled deadline) cancels the now-stale pending timeout instead of
 * leaving it to fire redundantly alongside the freshly armed one.
 */
export function useDailyRollover(onNewDay: (dayKey: string) => void): void {
  const dayKeyRef = useRef(dayKeyOf(Date.now()));
  const onNewDayRef = useRef(onNewDay);
  onNewDayRef.current = onNewDay;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const arm = () => {
      timer = setTimeout(check, msUntilNextMidnight(Date.now()) + 1000);
    };

    const check = () => {
      const current = dayKeyOf(Date.now());
      if (current !== dayKeyRef.current) {
        dayKeyRef.current = current;
        onNewDayRef.current(current);
      }
      clearTimeout(timer);
      arm();
    };

    arm();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
}
