import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDailyRollover } from '../useDailyRollover';

// 2026-09-20T23:59:00 in Sao Paulo (UTC-3, no DST) = 2026-09-21T02:59:00Z.
// One minute below the Sao Paulo midnight boundary, so a short, cheap
// timer advance is enough to cross it.
const START = Date.UTC(2026, 8, 21, 2, 59, 0);
const TODAY = '2026-09-20';
const TOMORROW = '2026-09-21';
const DAY_AFTER_TOMORROW = '2026-09-22';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDailyRollover', () => {
  it('does not fire before the day actually changes', () => {
    const onNewDay = vi.fn();
    renderHook(() => useDailyRollover(onNewDay));

    expect(onNewDay).not.toHaveBeenCalled();
  });

  it('fires once via the midnight timer when the clock crosses Sao Paulo midnight', () => {
    const onNewDay = vi.fn();
    renderHook(() => useDailyRollover(onNewDay));

    act(() => {
      vi.setSystemTime(START + 61_000);
      vi.advanceTimersByTime(61_000);
    });

    expect(onNewDay).toHaveBeenCalledTimes(1);
    expect(onNewDay).toHaveBeenCalledWith(TOMORROW);
  });

  it('re-arms after firing, so a second midnight crossing is also caught by the timer alone', () => {
    // No visibilitychange/focus is ever dispatched in this test — if the
    // timer only fired once at mount (the bug this guards against), the
    // second crossing below would have nothing left to catch it.
    const onNewDay = vi.fn();
    renderHook(() => useDailyRollover(onNewDay));

    act(() => {
      vi.advanceTimersByTime(61_000); // first crossing, into TOMORROW
    });
    expect(onNewDay).toHaveBeenCalledTimes(1);
    expect(onNewDay).toHaveBeenNthCalledWith(1, TOMORROW);

    act(() => {
      // 25h clears any single day's next-midnight distance (msUntilNextMidnight
      // is always <=24h) with the same 1h margin the hook itself budgets.
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    });
    expect(onNewDay).toHaveBeenCalledTimes(2);
    expect(onNewDay).toHaveBeenNthCalledWith(2, DAY_AFTER_TOMORROW);
  });

  it('fires on visibilitychange when the day changed while the tab was hidden, without waiting for the timer', () => {
    const onNewDay = vi.fn();
    renderHook(() => useDailyRollover(onNewDay));

    // The system clock jumps past midnight, but timers are NOT advanced —
    // this simulates a device that slept through the setTimeout's own
    // deadline, which is exactly the gap visibilitychange has to cover.
    act(() => {
      vi.setSystemTime(START + 5 * 60_000);
    });
    expect(onNewDay).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onNewDay).toHaveBeenCalledTimes(1);
    expect(onNewDay).toHaveBeenCalledWith(TOMORROW);
  });

  it('fires on focus when the day changed while the tab stayed foregrounded', () => {
    const onNewDay = vi.fn();
    renderHook(() => useDailyRollover(onNewDay));

    act(() => {
      vi.setSystemTime(START + 5 * 60_000);
    });

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(onNewDay).toHaveBeenCalledTimes(1);
    expect(onNewDay).toHaveBeenCalledWith(TOMORROW);
  });

  it('does not fire again for the same day once it has already fired', () => {
    const onNewDay = vi.fn();
    renderHook(() => useDailyRollover(onNewDay));

    act(() => {
      vi.setSystemTime(START + 5 * 60_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onNewDay).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onNewDay).toHaveBeenCalledTimes(1);
  });

  it('stops listening after unmount', () => {
    const onNewDay = vi.fn();
    const { unmount } = renderHook(() => useDailyRollover(onNewDay));
    unmount();

    act(() => {
      vi.setSystemTime(START + 5 * 60_000);
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });

    expect(onNewDay).not.toHaveBeenCalled();
  });

  it('sanity: the fixture actually starts on the expected day', () => {
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(START)).toBe(TODAY);
  });
});
