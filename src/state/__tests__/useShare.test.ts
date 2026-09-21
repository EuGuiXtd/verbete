import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatch, reduce } from '../../engine/match';
import type { EngineDeps } from '../../engine/match';
import { useShare } from '../useShare';

const deps: EngineDeps = { isValidGuess: () => true, now: () => 0 };

function wonMatch() {
  let state = createMatch({
    variant: 'solo', mode: 'diario', dayKey: '2026-09-20',
    answers: ['CASAL'], startedAt: 0,
  });
  for (const word of ['TERRA', 'CASAL']) {
    for (const letter of word) state = reduce(state, { type: 'TYPE', letter }, deps).state;
    state = reduce(state, { type: 'SUBMIT' }, deps).state;
  }
  return state;
}

function restoreNavigator(original: { share?: unknown; clipboard?: unknown }) {
  Object.defineProperty(navigator, 'share', { value: original.share, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: original.clipboard, configurable: true });
}

describe('useShare', () => {
  const original = { share: (navigator as { share?: unknown }).share, clipboard: navigator.clipboard };

  afterEach(() => {
    cleanup();
    restoreNavigator(original);
    vi.restoreAllMocks();
  });

  it('tries navigator.share first and reports "shared" when it resolves', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { result } = renderHook(() => useShare());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current(wonMatch());
    });

    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(outcome).toBe('shared');
  });

  it('falls back to clipboard.writeText when navigator.share does not exist, and reports "copied"', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { result } = renderHook(() => useShare());
    let outcome: string | undefined;
    let text = '';
    await act(async () => {
      outcome = await result.current(wonMatch());
    });
    text = writeText.mock.calls[0]?.[0] as string;

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('copied');
    expect(text).toContain('2/6');
    expect(text).not.toContain('CASAL');
  });

  it('reports "failed" quietly when navigator.share rejects (e.g. the user dismissed the share sheet)', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Abort', 'AbortError'));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { result } = renderHook(() => useShare());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current(wonMatch());
    });

    expect(outcome).toBe('failed');
    // A user-dismissed share sheet must not silently fall through to a
    // clipboard copy behind their back.
    expect(writeText).not.toHaveBeenCalled();
  });

  it('reports "failed" when neither navigator.share nor navigator.clipboard exist', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

    const { result } = renderHook(() => useShare());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current(wonMatch());
    });

    expect(outcome).toBe('failed');
  });

  it('reports "failed" when clipboard.writeText rejects', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { result } = renderHook(() => useShare());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current(wonMatch());
    });

    expect(outcome).toBe('failed');
  });
});
