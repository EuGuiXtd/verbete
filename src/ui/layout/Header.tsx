import { useTheme } from '../../state/useTheme';
import type { ThemeChoice } from '../../state/useTheme';

const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const THEME_LABEL: Record<ThemeChoice, string> = {
  system: 'sistema',
  light: 'claro',
  dark: 'escuro',
};

/**
 * The wordmark, set as a dictionary sets its own headword: lowercase serif,
 * syllable-dotted, followed by the part-of-speech abbreviation the way
 * src/dev/Showcase.tsx already established for "verbete" itself.
 */
function Wordmark() {
  return (
    <h1 className="flex items-baseline gap-2">
      <span
        className="text-headword font-semibold tracking-[-0.015em]"
        style={{ fontVariationSettings: "'opsz' 32" }}
      >
        ver&middot;be&middot;te
      </span>
      <span className="text-small italic text-ghost">s.m.</span>
    </h1>
  );
}

/**
 * The top bar: wordmark on the left, help / stats / theme on the right.
 * Help and stats have no modal to open yet — that is Task 22's
 * `HelpModal`/`StatsModal` — so their buttons are present (the header's
 * final shape) but inert for now. Theme is fully wired: `useTheme` already
 * exists and this task's scope explicitly includes it.
 */
export function Header() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-3 sm:px-6">
      <Wordmark />
      <div className="flex items-center gap-1">
        {/*
          `disabled`: these have no modal to open yet (Task 22's
          HelpModal/StatsModal). Without it a press is silent — reads as
          broken, not as "not built yet" — and a screen reader announces
          them as ordinary, actionable buttons that do nothing.
        */}
        <button type="button" className="tecla px-3" aria-label="Ajuda" disabled>
          ?
        </button>
        <button type="button" className="tecla px-3" aria-label="Estatísticas" disabled>
          #
        </button>
        <button
          type="button"
          className="tecla px-3"
          aria-label={`Tema: ${THEME_LABEL[theme]}. Toque para alternar.`}
          onClick={() => {
            setTheme(NEXT_THEME[theme]);
          }}
        >
          {THEME_LABEL[theme]}
        </button>
      </div>
    </header>
  );
}
