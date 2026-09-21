import { useState } from 'react';
import { useTheme } from '../../state/useTheme';
import type { ThemeChoice } from '../../state/useTheme';
import { blurOnMouseActivation } from '../blurOnMouseActivation';
import { AboutModal } from '../modals/AboutModal';
import { HelpModal } from '../modals/HelpModal';
import { HistoryModal } from '../modals/HistoryModal';
import { StatsModal } from '../modals/StatsModal';
import type { MouseEvent } from 'react';

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
 */
export function Header() {
  const { theme, setTheme } = useTheme();
  const [openModal, setOpenModal] = useState<OpenModal>(null);

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-3 sm:px-6">
      <Wordmark />
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="tecla px-3"
          aria-label="Ajuda"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            blurOnMouseActivation(event);
            setOpenModal('help');
          }}
        >
          ?
        </button>
        <button
          type="button"
          className="tecla px-3"
          aria-label="Estatísticas"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            blurOnMouseActivation(event);
            setOpenModal('stats');
          }}
        >
          #
        </button>
        <button
          type="button"
          className="tecla px-3"
          aria-label={`Tema: ${THEME_LABEL[theme]}. Toque para alternar.`}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            blurOnMouseActivation(event);
            setTheme(NEXT_THEME[theme]);
          }}
        >
          {THEME_LABEL[theme]}
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
      />
      <HistoryModal isOpen={openModal === 'history'} onClose={() => { setOpenModal(null); }} />
      <AboutModal isOpen={openModal === 'about'} onClose={() => { setOpenModal(null); }} />
    </header>
  );
}
