import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDefinition } from '../../data/definitions';
import { useDefinition } from '../useDefinition';

// Only loadDefinition is mocked — parseDefinition stays real, since these
// tests exercise the hook's actual parsing of a raw "<abbrev> <gloss>"
// string, not a second, hand-rolled stand-in for it.
vi.mock('../../data/definitions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/definitions')>()),
  loadDefinition: vi.fn(),
}));

const mockedLoadDefinition = vi.mocked(loadDefinition);

beforeEach(() => {
  mockedLoadDefinition.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useDefinition', () => {
  it('starts loading, then resolves a parsed definition', async () => {
    mockedLoadDefinition.mockResolvedValue('s.f. planta ornamental');

    const { result } = renderHook(() => useDefinition('dália'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.definition).toBeNull();
    expect(mockedLoadDefinition).toHaveBeenCalledWith('dália');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.definition).toEqual({ abbrev: 's.f.', gloss: 'planta ornamental' });
  });

  it('resolves to null, not loading, for a word with no generated definition', async () => {
    mockedLoadDefinition.mockResolvedValue(null);

    const { result } = renderHook(() => useDefinition('lenta'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.definition).toBeNull();
  });

  it('never loads when the word is null — no board has been solved yet', () => {
    const { result } = renderHook(() => useDefinition(null));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.definition).toBeNull();
    expect(mockedLoadDefinition).not.toHaveBeenCalled();
  });

  it('discards a stale in-flight result when the word changes before it resolves', async () => {
    let resolvePrato!: (value: string | null) => void;
    const pratoPromise = new Promise<string | null>((resolve) => {
      resolvePrato = resolve;
    });
    mockedLoadDefinition.mockImplementation((word: string) =>
      word === 'prato' ? pratoPromise : Promise.resolve('v. ligar'),
    );

    const { result, rerender } = renderHook(({ word }) => useDefinition(word), {
      initialProps: { word: 'prato' as string | null },
    });
    rerender({ word: 'casar' });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.definition).toEqual({ abbrev: 'v.', gloss: 'ligar' });

    // The stale "prato" fetch resolving after the word already moved on
    // must not clobber "casar"'s already-settled result.
    resolvePrato('s.m. vasilha');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.definition).toEqual({ abbrev: 'v.', gloss: 'ligar' });
  });
});
