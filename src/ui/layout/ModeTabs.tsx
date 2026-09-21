import { MODES, MODE_LABEL, VARIANT_LABEL, VARIANT_ORDER } from '../../engine/constants';
import { useMatch } from '../../state/useMatch';

type TabSelection = 'selected' | 'unselected';

// Written out in full, one complete class string per state: the Tailwind
// scanner reads source as plain text, so a class assembled by interpolation
// (`tecla-${state}`) would be silently pruned from the build. Mirrors the
// pattern established in Tile.tsx and Key.tsx.
const TAB_CLASS: Record<TabSelection, string> = {
  selected: 'tecla tecla-certa px-3',
  unselected: 'tecla px-3',
};

/**
 * Switches which of the six variant x mode matches is on screen. Every
 * combination keeps its own `MatchState` in `MatchProvider` — selecting one
 * here never resets another; see `MatchProvider`'s lazily-populated
 * `matches` map.
 *
 * The trailing slot is contextual, not a third tab row: a daily match has
 * exactly one puzzle a day, so there is nothing to reroll and the slot
 * shows its number instead; an infinite match has no such number, so the
 * slot offers "nova palavra" — a reset a player can reach for at any time,
 * not only after finishing.
 */
export function ModeTabs() {
  const { active, selectMode, dailyNumber, newMatch } = useMatch();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-2 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="group" aria-label="Variante">
          {VARIANT_ORDER.map((variant) => (
            <button
              key={variant}
              type="button"
              aria-pressed={active.variant === variant}
              className={TAB_CLASS[active.variant === variant ? 'selected' : 'unselected']}
              onClick={() => {
                selectMode(variant, active.mode);
              }}
            >
              {VARIANT_LABEL[variant]}
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Modo">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={active.mode === mode}
              className={TAB_CLASS[active.mode === mode ? 'selected' : 'unselected']}
              onClick={() => {
                selectMode(active.variant, mode);
              }}
            >
              {MODE_LABEL[mode]}
            </button>
          ))}
        </div>
      </div>
      {active.mode === 'diario' ? (
        dailyNumber !== null && (
          <span className="text-small italic text-ghost" aria-label={`Verbete número ${String(dailyNumber)}`}>
            #{dailyNumber}
          </span>
        )
      ) : (
        <button type="button" className="tecla px-3" onClick={newMatch} aria-label="Começar uma nova palavra">
          nova palavra
        </button>
      )}
    </div>
  );
}
