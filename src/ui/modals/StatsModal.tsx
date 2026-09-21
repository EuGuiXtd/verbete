import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { MODES, MODE_LABEL, VARIANTS, VARIANT_LABEL, VARIANT_ORDER } from '../../engine/constants';
import { winRate } from '../../engine/stats';
import type { Mode, Variant } from '../../engine/types';
import { useStats } from '../../state/useStats';
import { loadHistory } from '../../storage/repository';
import { blurOnMouseActivation } from '../blurOnMouseActivation';
import { Modal } from './Modal';

type TabSelection = 'selected' | 'unselected';

// Written out in full, one complete class string per state — see
// ModeTabs.tsx's own comment on why this cannot be built by interpolation.
const TAB_CLASS: Record<TabSelection, string> = {
  selected: 'tecla tecla-certa px-3',
  unselected: 'tecla px-3',
};

export interface StatsModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onOpenHistory: () => void;
  /**
   * What the selector opens on. Optional, defaulting to Solo/Diário, so a
   * standalone render of this component (as every test below does) keeps
   * working without a caller having to know what the "sensible default"
   * is. `Header` passes the player's actual currently-active variant/mode
   * instead (review round 2) — see its own doc comment on why.
   */
  readonly defaultVariant?: Variant;
  readonly defaultMode?: Mode;
}

/**
 * The attempt count of the most recent FINISHED match in (variant, mode), or
 * `null` if there is none yet, or if that match was a loss (a loss has no
 * distribution bar of its own to highlight — `StatsRecord.distribution` only
 * ever counts wins, see engine/stats.ts). History is read directly from the
 * repository rather than threaded through `useStats`, matching this task's
 * own "Consumes: ... history from the repository" scope.
 */
function mostRecentWinAttempts(variant: Variant, mode: Mode): number | null {
  const entries = loadHistory().filter((entry) => entry.variant === variant && entry.mode === mode);
  if (entries.length === 0) return null;
  const latest = entries.reduce((a, b) => (b.finishedAt > a.finishedAt ? b : a));
  return latest.won ? latest.attempts : null;
}

/**
 * Games, win rate, streak (daily only) and the attempt distribution, per
 * variant x mode, with its own selector — the same variant/mode tab pattern
 * `ModeTabs.tsx` already established, reused here rather than reinvented
 * because this is the exact same "pick one of three x one of two" control.
 *
 * Streak is shown only for `'diario'`: infinite mode's streak sits frozen at
 * 0 forever (see engine/stats.ts's `applyResult` — infinite counts towards
 * `played`/`wins` but never touches `streak`), and showing an
 * always-zero number next to a real one for the other mode would read as a
 * bug, not as a deliberate design choice.
 */
export function StatsModal({
  isOpen,
  onClose,
  onOpenHistory,
  defaultVariant = 'solo',
  defaultMode = 'diario',
}: StatsModalProps) {
  const [variant, setVariant] = useState<Variant>(defaultVariant);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const { getStats } = useStats();

  // `Header` always renders `<StatsModal isOpen={...} />` — this component
  // never actually unmounts between opens the way `Modal` (its own child,
  // conditionally rendered below) does, so `useState(defaultVariant)`'s
  // initial value is captured exactly once, on Header's very first render,
  // and would otherwise go stale for every subsequent open. This resets the
  // selector back to whatever is currently active each time `isOpen`
  // transitions to `true`, using React's own documented pattern for
  // "adjust state in response to a prop changing" — a plain `setState`
  // call during render, guarded so it only fires on the actual transition —
  // rather than a `useEffect`, specifically to avoid a one-frame flash of
  // the previous selection before the dialog's first paint (an effect runs
  // after paint; this runs before it, in the same render pass).
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setVariant(defaultVariant);
      setMode(defaultMode);
    }
  }

  // Recomputed on every render this component is asked to make (isOpen
  // flipping true, or the selector changing) rather than cached in state:
  // there is no event this component could otherwise subscribe to that
  // fires when a match elsewhere finishes and changes what is on disk.
  const stats = isOpen ? getStats(variant, mode) : null;
  const highlightAttempts = useMemo(
    () => (isOpen ? mostRecentWinAttempts(variant, mode) : null),
    [isOpen, variant, mode],
  );

  if (!isOpen || stats === null) return null;

  const maxAttempts = VARIANTS[variant].attempts;
  const counts = Array.from({ length: maxAttempts }, (_, i) => i + 1).map((n) => ({
    attempts: n,
    count: stats.distribution[n] ?? 0,
  }));
  const maxCount = Math.max(1, ...counts.map((c) => c.count));

  return (
    <Modal
      titleId="estatisticas-titulo"
      title="Estatísticas"
      onClose={onClose}
      headerExtra={
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex gap-1" role="group" aria-label="Variante">
            {VARIANT_ORDER.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={variant === v}
                className={TAB_CLASS[variant === v ? 'selected' : 'unselected']}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  blurOnMouseActivation(event);
                  setVariant(v);
                }}
              >
                {VARIANT_LABEL[v]}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Modo">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={TAB_CLASS[mode === m ? 'selected' : 'unselected']}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  blurOnMouseActivation(event);
                  setMode(m);
                }}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <dl className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
        <div>
          <dt className="text-micro uppercase tracking-wide text-ghost">jogadas</dt>
          <dd className="text-headword font-semibold" data-testid="stat-jogadas">
            {stats.played}
          </dd>
        </div>
        <div>
          <dt className="text-micro uppercase tracking-wide text-ghost">% de vitórias</dt>
          <dd className="text-headword font-semibold" data-testid="stat-vitorias">
            {winRate(stats)}%
          </dd>
        </div>
        {mode === 'diario' && (
          <>
            <div>
              <dt className="text-micro uppercase tracking-wide text-ghost">sequência atual</dt>
              <dd className="text-headword font-semibold" data-testid="stat-sequencia">
                {stats.streak}
              </dd>
            </div>
            <div>
              <dt className="text-micro uppercase tracking-wide text-ghost">melhor sequência</dt>
              <dd className="text-headword font-semibold" data-testid="stat-melhor-sequencia">
                {stats.bestStreak}
              </dd>
            </div>
          </>
        )}
      </dl>

      <div className="folha-regua" />

      <div className="space-y-1.5">
        <p className="mb-2 text-small text-ghost">Distribuição de tentativas</p>
        {counts.map(({ attempts, count }) => {
          const isHighlighted = highlightAttempts === attempts;
          return (
            <div
              key={attempts}
              className="flex items-center gap-2"
              data-testid={isHighlighted ? 'distribuicao-recente' : undefined}
            >
              <span className="w-3 text-right text-small" data-testid="distribuicao-rotulo">
                {attempts}
              </span>
              <div className="h-5 flex-1 rounded-sheet bg-paper-recess">
                <div
                  className={isHighlighted ? 'h-full rounded-sheet bg-ink-red' : 'h-full rounded-sheet bg-ink'}
                  style={{ width: `${String(Math.max(count > 0 ? 8 : 0, (count / maxCount) * 100))}%` }}
                />
              </div>
              <span className="w-6 text-small text-ghost">{count}</span>
            </div>
          );
        })}
      </div>

      <div className="folha-regua" />

      <button
        type="button"
        className="text-small underline decoration-rule underline-offset-2"
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          blurOnMouseActivation(event);
          onOpenHistory();
        }}
      >
        ver histórico completo
      </button>
    </Modal>
  );
}
