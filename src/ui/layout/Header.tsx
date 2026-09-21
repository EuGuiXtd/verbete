import { useState } from 'react';
import { useMatch } from '../../state/useMatch';
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
 *
 * Ajuda and Estatísticas deliberately do NOT call `blurOnMouseActivation` —
 * see `Modal.tsx`'s own doc comment on why a modal trigger needs the
 * opposite of every other chrome button's behaviour (it must stay focused
 * so closing the dialog has something real to return focus to).
 */
export function Header() {
  const { theme, setTheme } = useTheme();
  const { active } = useMatch();
  const [openModal, setOpenModal] = useState<OpenModal>(null);

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-3 sm:px-6">
      <Wordmark />
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="tecla px-3"
          aria-label="Ajuda"
          onClick={() => {
            setOpenModal('help');
          }}
        >
          ?
        </button>
        <button
          type="button"
          className="tecla px-3"
          aria-label="Estatísticas"
          onClick={() => {
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
