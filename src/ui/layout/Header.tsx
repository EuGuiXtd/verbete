import { useState } from 'react';
import { useMatch } from '../../state/useMatch';
import { useTheme } from '../../state/useTheme';
import type { ThemeChoice } from '../../state/useTheme';
import { blurOnMouseActivation } from '../blurOnMouseActivation';
import { AboutModal } from '../modals/AboutModal';
import { HelpModal } from '../modals/HelpModal';
import { HistoryModal } from '../modals/HistoryModal';
import { StatsModal } from '../modals/StatsModal';
import { EstatisticasIcon, LuaIcon, SistemaIcon, SolIcon } from './icons';
import type { MouseEvent, ReactNode } from 'react';

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
 * Feedback round 1, item 1: the theme control "não ficou explícito". It used
 * to be one lowercase word — "sistema", "claro", "escuro" — sitting in a row
 * of chrome buttons: that states the current value, but never says the thing
 * is a switch, or a switch of WHAT. The word stays (it is the only part that
 * can report the third, non-obvious `system` state) and gains the pictogram
 * that names the subject, so the control reads as sun-plus-"claro" rather
 * than as a stray word. An icon rather than a second line of text because
 * this header has to survive 320px alongside the wordmark.
 */
const THEME_ICON: Record<ThemeChoice, ReactNode> = {
  system: <SistemaIcon />,
  light: <SolIcon />,
  dark: <LuaIcon />,
};

/**
 * What pressing it will DO, not only what it currently is. A label that
 * reports the current value alone leaves a screen-reader user to guess the
 * effect, and this control cycles three values rather than toggling two, so
 * "alternar" on its own does not say where it lands either.
 */
function themeAriaLabel(theme: ThemeChoice): string {
  return `Tema: ${THEME_LABEL[theme]}. Trocar para ${THEME_LABEL[NEXT_THEME[theme]]}`;
}

/**
 * The wordmark, set as a dictionary sets its own headword: lowercase serif,
 * syllable-dotted, followed by the part-of-speech abbreviation the way
 * src/dev/Showcase.tsx already established for "verbete" itself.
 */
function Wordmark() {
  return (
    <h1 className="flex items-baseline gap-2">
      {/*
        Feedback round 1, item 1 (the theme control): the wordmark and the
        part-of-speech tag together claimed more than half of a 320px header,
        which is why the theme button had to be a bare word to fit at all and
        still ran off the right edge. Both give ground below `sm:` — the
        wordmark by one step, the "s.m." entirely — and at `sm:` up both are
        exactly what they were. `text-[1.375rem]` rather than a smaller
        `--text-headword` floor: that token is also the size of StatsModal's
        four big numbers, which have no such squeeze and should not shrink
        with this one.
      */}
      <span
        className="text-[1.375rem] font-semibold tracking-[-0.015em] sm:text-headword"
        style={{ fontVariationSettings: "'opsz' 32" }}
      >
        ver&middot;be&middot;te
      </span>
      <span className="hidden text-small italic text-ghost sm:inline">s.m.</span>
    </h1>
  );
}

/**
 * Which of the four screens this task adds is currently open, if any. Only
 * one at a time — opening a new one always replaces whichever was showing,
 * the same "one dialog on screen" invariant `ResultModal` already holds
 * (nothing else in this app ever stacks two `.cortina` overlays). History
 * and About have no header button of their own: they are reached from
 * inside Stats and Help respectively (see `StatsModal`'s "ver histórico
 * completo" and `HelpModal`'s "sobre as fontes"), which is also why
 * switching to either from within another modal must close the one
 * underneath rather than stack on top of it.
 */
type OpenModal = 'help' | 'stats' | 'history' | 'about' | null;

/**
 * The top bar: wordmark on the left, help / stats / theme on the right.
 * Ajuda and Estatísticas open `HelpModal`/`StatsModal` (Task 22); History
 * and About are reached from inside those two, not from their own header
 * button — see `OpenModal`'s doc comment. Theme is fully wired: `useTheme`
 * already exists and this task's scope explicitly includes it.
 *
 * Ajuda and Estatísticas call `blurOnMouseActivation` exactly like every
 * other chrome button in this app (mode/variant tabs, "nova palavra", the
 * theme toggle) — see `Modal.tsx`'s own doc comment for why keeping it,
 * rather than removing it (round 2 of this task's review removed it, then
 * round 3 put it back), is what makes focus-restore-on-close correct for
 * BOTH a mouse and a keyboard player, with no new trade-off for either.
 */
export function Header() {
  const { theme, setTheme } = useTheme();
  const { active } = useMatch();
  const [openModal, setOpenModal] = useState<OpenModal>(null);

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-rule px-3 py-3 sm:gap-3 sm:px-6">
      <Wordmark />
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="tecla px-2.5 sm:px-3"
          aria-label="Como jogar"
          title="Como jogar"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            blurOnMouseActivation(event);
            setOpenModal('help');
          }}
        >
          ?
        </button>
        <button
          type="button"
          className="tecla px-2.5 sm:px-3"
          aria-label="Estatísticas"
          title="Estatísticas"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            blurOnMouseActivation(event);
            setOpenModal('stats');
          }}
        >
          <EstatisticasIcon />
        </button>
        <button
          type="button"
          // `flex` (not `.tecla`'s own `display: grid`) so the pictogram and
          // the word sit on one baseline-aligned line: Tailwind's utilities
          // layer wins over the components layer `.tecla` lives in, which is
          // the same layering `min-w-[30px]` on a key already relies on.
          className="tecla flex items-center gap-1.5 px-2.5 sm:px-3"
          aria-label={themeAriaLabel(theme)}
          title={themeAriaLabel(theme)}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            blurOnMouseActivation(event);
            setTheme(NEXT_THEME[theme]);
          }}
        >
          {THEME_ICON[theme]}
          <span>{THEME_LABEL[theme]}</span>
        </button>
      </div>
      <HelpModal
        isOpen={openModal === 'help'}
        onClose={() => { setOpenModal(null); }}
        onOpenAbout={() => { setOpenModal('about'); }}
      />
      <StatsModal
        isOpen={openModal === 'stats'}
        onClose={() => { setOpenModal(null); }}
        onOpenHistory={() => { setOpenModal('history'); }}
        // Review round 2: defaults the selector to whatever the player is
        // actually playing right now, rather than a hardcoded Solo/Diário —
        // a player who just finished an Infinito match and opens Stats
        // should see that match's numbers, not zeroes for a mode they
        // weren't in. `StatsModal` re-reads these only at mount (it fully
        // unmounts on close), so this always reflects `active` as of the
        // moment Stats was opened, and stays freely switchable afterwards.
        defaultVariant={active.variant}
        defaultMode={active.mode}
      />
      <HistoryModal isOpen={openModal === 'history'} onClose={() => { setOpenModal(null); }} />
      <AboutModal isOpen={openModal === 'about'} onClose={() => { setOpenModal(null); }} />
    </header>
  );
}
