import { useCallback } from 'react';
import { renderShare } from '../engine/share';
import type { MatchState } from '../engine/match';

/**
 * Which path a share attempt actually took, so the caller can toast the
 * right word — "Compartilhado!" for the native share sheet, "Copiado!" for
 * the clipboard fallback — or say nothing at all for `'failed'`.
 */
export type ShareOutcome = 'shared' | 'copied' | 'failed';

/**
 * Tries the native Web Share API first, falls back to the clipboard only
 * when that API does not exist at all, and never throws.
 *
 * `navigator.share` rejecting (most commonly `AbortError`, thrown when the
 * player opens the share sheet and then dismisses it without picking a
 * target) is deliberately treated as a quiet `'failed'`, not as a reason to
 * fall through to a clipboard copy: a player who just told the OS "never
 * mind" has not asked for their result to land on the clipboard instead,
 * and doing that behind their back would be a surprise, not a convenience.
 * The clipboard path is only ever reached when `navigator.share` is not a
 * function to begin with — an unsupported browser, not a declined share.
 *
 * `renderShare` already guarantees the rendered text never contains the
 * answer (see engine/share.ts and its tests); this hook only decides how
 * that text leaves the device.
 */
export function useShare(): (state: MatchState) => Promise<ShareOutcome> {
  return useCallback(async (state: MatchState): Promise<ShareOutcome> => {
    const text = renderShare(state, { url: window.location.origin });

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return 'shared';
      } catch {
        return 'failed';
      }
    }

    if (typeof navigator.clipboard?.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return 'copied';
      } catch {
        return 'failed';
      }
    }

    return 'failed';
  }, []);
}
