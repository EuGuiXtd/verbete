import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Header } from '../Header';
import { MatchProvider } from '../../../state/MatchProvider';
import { useMatch } from '../../../state/useMatch';
import { THEME_ATTRIBUTE } from '../../../state/useTheme';

// A small, deterministic stand-in for the real 1500-word daily pool — see
// ModeTabs.test.tsx's own comment for why this must be distinct entries,
// not just distinct labels.
const DAILY_POOL = Array.from({ length: 20 }, (_, i) => `w${String(i).padStart(4, '0')}`);
let infiniteAnswerIndex = 0;
const infiniteAnswers = ['casal', 'terra', 'prato', 'findo', 'claro', 'muito', 'nunca'];

vi.mock('../../../data/dictionary', () => ({
  isValidGuess: () => true,
  dailyPool: () => DAILY_POOL,
  DICTIONARY_VERSION: 'test-fixture',
  pickRandomAnswer: () => {
    const answer = infiniteAnswers[infiniteAnswerIndex % infiniteAnswers.length]!;
    infiniteAnswerIndex += 1;
    return answer;
  },
}));

// jsdom's own matchMedia always answers `false` and never fires a listener,
// but installing a controllable one (as src/state/__tests__/useTheme.test.ts
// does) isn't the point here — Header only needs matchMedia to exist and
// not throw, so useTheme can read a starting `resolved` value.
function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return <MatchProvider>{children}</MatchProvider>;
}

/** Lets a test switch the active variant/mode Header reads via `useMatch()`, without going through ModeTabs. */
function SwitchTo({ variant, mode }: { variant: 'solo' | 'dueto' | 'quarteto'; mode: 'diario' | 'infinito' }) {
  const { selectMode } = useMatch();
  return (
    <button type="button" onClick={() => selectMode(variant, mode)}>
      mudar para {variant}/{mode}
    </button>
  );
}

beforeEach(() => {
  installMatchMedia();
  infiniteAnswerIndex = 0;
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe('Header', () => {
  it('carries the wordmark set as a dictionary headword — lowercase serif, then "s.m."', () => {
    render(<Header />, { wrapper });
    // Syllable-dotted, the way a dictionary headword is set (see
    // src/dev/Showcase.tsx's own "ver·be·te"), not the plain word.
    expect(screen.getByText('ver·be·te')).toBeDefined();
    expect(screen.getByText('s.m.')).toBeDefined();
  });

  it('offers help, stats and theme controls, each with a Portuguese accessible name', () => {
    render(<Header />, { wrapper });
    expect(screen.getByRole('button', { name: /ajuda/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /estatísticas/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /tema/i })).toBeDefined();
  });

  it('leaves every header control enabled — Task 22 wired Ajuda and Estatísticas up', () => {
    render(<Header />, { wrapper });
    const help = screen.getByRole('button', { name: /ajuda/i }) as HTMLButtonElement;
    const stats = screen.getByRole('button', { name: /estatísticas/i }) as HTMLButtonElement;
    const theme = screen.getByRole('button', { name: /tema/i }) as HTMLButtonElement;

    expect(help.disabled).toBe(false);
    expect(stats.disabled).toBe(false);
    expect(theme.disabled).toBe(false);
  });

  it('opens HelpModal from Ajuda and closes it again on Escape', () => {
    render(<Header />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /ajuda/i }));
    expect(screen.getByRole('dialog', { name: /como jogar/i })).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens StatsModal from Estatísticas, and only one dialog is on screen at a time', () => {
    render(<Header />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /estatísticas/i }));
    expect(screen.getByRole('dialog', { name: /estatísticas/i })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /ajuda/i }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: /como jogar/i })).toBeDefined();
  });

  it('reaches About from inside Help, and History from inside Stats', () => {
    render(<Header />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: /ajuda/i }));
    fireEvent.click(screen.getByRole('button', { name: /sobre as fontes/i }));
    expect(screen.getByRole('dialog', { name: /sobre as palavras/i })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /estatísticas/i }));
    fireEvent.click(screen.getByRole('button', { name: /ver histórico/i }));
    expect(screen.getByRole('dialog', { name: /histórico/i })).toBeDefined();
  });

  it('cycles the theme through the document attribute when its button is pressed', () => {
    render(<Header />, { wrapper });
    const themeButton = screen.getByRole('button', { name: /tema/i });

    fireEvent.click(themeButton);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');

    fireEvent.click(themeButton);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');

    fireEvent.click(themeButton);
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false); // back to 'system'
  });

  // Review round 2, finding 3: Stats used to always default to Solo/Diário
  // regardless of what the player was actually playing (the app's own
  // default active match is Solo/Infinito — see MatchProvider's
  // `initSlice`), so a first-time player who just finished their first
  // (default) match and opened Stats would see zeroes for a mode they
  // never played. This proves the selector now opens on whatever `active`
  // actually is.
  it('defaults the Stats selector to the currently active variant and mode, not a hardcoded Solo/Diário', () => {
    render(
      <>
        <Header />
        <SwitchTo variant="dueto" mode="diario" />
      </>,
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: /mudar para dueto\/diario/i }));
    fireEvent.click(screen.getByRole('button', { name: /estatísticas/i }));

    const dialog = screen.getByRole('dialog', { name: /estatísticas/i });
    const pressed = (name: string) => within(dialog).getByRole('button', { name }).getAttribute('aria-pressed');
    expect(pressed('Dueto')).toBe('true');
    expect(pressed('Diário')).toBe('true');
    // Confirms it isn't just always "whatever was last picked" by coincidence:
    // Solo/Infinito would have been the previous default's own values.
    expect(pressed('Solo')).toBe('false');
    expect(pressed('Infinito')).toBe('false');
  });

  // Review round 3 correction: round 2 first shipped this test asserting
  // `document.activeElement` was back on the Ajuda button after a
  // mouse-driven close — which required Header to stop calling
  // `blurOnMouseActivation` on Ajuda, and that "fix" invented focus a mouse
  // user never had, reopening the swallowed-Enter regression
  // `blurOnMouseActivation` exists to prevent (see Modal.tsx's own doc
  // comment for the full account). Round 3 restored the blur call, so this
  // now asserts the opposite and correct thing: after a mouse click opens
  // and a mouse click closes, NO button is left focused — Ajuda was blurred
  // on its own click (`event.detail !== 0`), so `Modal` captured
  // `document.body` (not an `HTMLElement`) as the "trigger", and restoring
  // to it on close is a correct no-op. `userEvent.click`, not
  // `fireEvent.click`, is what actually gives this test a real signal:
  // `fireEvent.click` never focuses anything in jsdom, so it would report
  // success regardless of whether `blurOnMouseActivation` ran at all.
  // e2e/header-modal-focus.spec.ts proves the behavioural consequence (a
  // bare Enter afterwards reaches the game, not the button) against a real
  // browser; this is the jsdom-level check that no DOM focus was invented.
  it('leaves no button focused after a mouse-clicked HelpModal closes', async () => {
    const user = userEvent.setup();
    render(<Header />, { wrapper });
    const helpButton = screen.getByRole('button', { name: /ajuda/i });

    await user.click(helpButton);
    expect(screen.getByRole('dialog')).toBeDefined();
    // Blurred by its own click, exactly like every other chrome button.
    expect(document.activeElement).not.toBe(helpButton);

    await user.click(screen.getByRole('button', { name: 'fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
