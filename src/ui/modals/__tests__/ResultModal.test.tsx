import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MatchProvider } from '../../../state/MatchProvider';
import { useMatch } from '../../../state/useMatch';
import { loadDefinition } from '../../../data/definitions';
import { ResultModal } from '../ResultModal';

const DAILY_POOL = Array.from({ length: 20 }, (_, i) => `w${String(i).padStart(4, '0')}`);
let infiniteAnswerIndex = 0;
// Solo/Infinito's board is always seeded with the FIRST of these — every
// test below plays against the secret "casal".
const infiniteAnswers = ['casal', 'terra', 'prato', 'findo'];
const VALID_GUESSES = new Set(['CASAL', 'TERRA', 'PRATO', 'FINDO', 'HORAS', 'CASAS', 'CLARO']);

vi.mock('../../../data/dictionary', () => ({
  isValidGuess: (word: string) => VALID_GUESSES.has(word),
  dailyPool: () => DAILY_POOL,
  pickRandomAnswer: () => {
    const answer = infiniteAnswers[infiniteAnswerIndex % infiniteAnswers.length]!;
    infiniteAnswerIndex += 1;
    return answer;
  },
}));

// Only loadDefinition is mocked — parseDefinition stays real (see
// src/state/__tests__/useDefinition.test.ts for the same pattern and why).
vi.mock('../../../data/definitions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../data/definitions')>()),
  loadDefinition: vi.fn(),
}));

const mockedLoadDefinition = vi.mocked(loadDefinition);

function wrapper({ children }: { children: ReactNode }) {
  return <MatchProvider>{children}</MatchProvider>;
}

function Harness() {
  const { type, submit } = useMatch();
  return (
    <>
      <ResultModal />
      <button
        type="button"
        onClick={() => {
          for (const letter of 'CASAL') type(letter);
          submit();
        }}
      >
        win
      </button>
      <button
        type="button"
        onClick={() => {
          for (const word of ['TERRA', 'PRATO', 'FINDO', 'HORAS', 'CASAS', 'CLARO']) {
            for (const letter of word) type(letter);
            submit();
          }
        }}
      >
        lose
      </button>
    </>
  );
}

beforeEach(() => {
  infiniteAnswerIndex = 0;
  localStorage.clear();
  document.documentElement.style.setProperty('--reveal-duration', '0ms');
  document.documentElement.style.setProperty('--press-duration', '0ms');
  mockedLoadDefinition.mockReset();
  mockedLoadDefinition.mockImplementation((word: string) =>
    Promise.resolve(word === 'casal' ? 's.m. par afetivo' : null),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.style.removeProperty('--reveal-duration');
  document.documentElement.style.removeProperty('--press-duration');
});

describe('ResultModal', () => {
  it('renders nothing while the match is still playing', () => {
    render(<Harness />, { wrapper });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the headword, its definition and a Wikcionário link once the match is won', async () => {
    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'win' }));

    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(screen.getByText('Você acertou!')).toBeDefined();
    expect(screen.getByText('casal')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText(/par afetivo/)).toBeDefined();
    });
    const link = screen.getByRole('link', { name: /wikcionário/i });
    expect(link.getAttribute('href')).toBe('https://pt.wiktionary.org/wiki/casal');
  });

  it('shows the reveal on a loss too, with the correct headline and headword', async () => {
    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'lose' }));

    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(screen.getByText(/não foi dessa vez/i)).toBeDefined();
    expect(screen.getByText('casal')).toBeDefined();
  });

  it('omits the definition paragraph entirely for a word with no generated definition', async () => {
    mockedLoadDefinition.mockResolvedValue(null);
    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'win' }));

    const dialog = await screen.findByRole('dialog');
    expect(screen.getByText('casal')).toBeDefined();
    // Give the (mocked, already-resolved) lookup a tick to settle, then
    // confirm no numbered-sense paragraph was ever added — not "added and
    // then hidden", genuinely never rendered.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dialog.querySelector('article p')).toBeNull();
  });

  it('closes on its own close control without crashing the match underneath', async () => {
    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'win' }));
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: /fechar/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('copies the word to the clipboard when the quiet report control is used', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'win' }));
    await screen.findByRole('dialog');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /palavra errada/i }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('casal');
  });

  describe('sharing', () => {
    afterEach(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });

    it('shares the result via navigator.share and shows "compartilhado!" feedback, never leaking the answer', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });

      render(<Harness />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'win' }));
      await screen.findByRole('dialog');

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /compartilhar/i }));
        await Promise.resolve();
      });

      expect(share).toHaveBeenCalledTimes(1);
      const sharedText = (share.mock.calls[0]?.[0] as { text: string }).text;
      expect(sharedText).not.toContain('CASAL');
      expect(await screen.findByText('compartilhado!')).toBeDefined();
    });

    it('falls back to the clipboard and shows "copiado!" when navigator.share does not exist', async () => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      render(<Harness />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'win' }));
      await screen.findByRole('dialog');

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /compartilhar/i }));
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('copiado!')).toBeDefined();
    });
  });
});
