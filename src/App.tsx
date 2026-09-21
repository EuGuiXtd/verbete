import { keyboardStates } from './engine/keyboard';
import { MatchProvider } from './state/MatchProvider';
import { useMatch } from './state/useMatch';
import { usePhysicalKeyboard } from './state/usePhysicalKeyboard';
import { Board } from './ui/board/Board';
import { ToastHost } from './ui/feedback/ToastHost';
import { Header } from './ui/layout/Header';
import { ModeTabs } from './ui/layout/ModeTabs';
import { Shell } from './ui/layout/Shell';
import { Keyboard } from './ui/keyboard/Keyboard';

/**
 * The end-of-match status line. No result modal in this task's scope (Task
 * 21 adds the dictionary-entry ResultModal) — just enough for a player to
 * see the outcome. There is no reset control here: infinite mode's is the
 * persistent "nova palavra" button in ModeTabs (reachable before finishing
 * too, not only after), and a finished daily match has nothing to reset —
 * one puzzle a day is the entire point.
 */
function MatchOutcome() {
  const { state } = useMatch();
  if (state.status === 'playing') return null;

  const board = state.boards[0];
  return (
    <p className="text-lead text-center">
      {state.status === 'won' ? 'Você acertou!' : `Não foi dessa vez. A palavra era "${board?.answer ?? ''}".`}
    </p>
  );
}

/**
 * "Chegou o verbete de hoje": the day rolled over while this variant's
 * daily match was still in progress. The board underneath is deliberately
 * left exactly as the player left it — swapping it out from under someone
 * mid-guess would be the single most hostile thing this feature could do —
 * so this banner is the only way the new day's match ever gets applied.
 */
function DailyRolloverBanner() {
  const { dailyRolloverPending, applyDailyRollover } = useMatch();
  if (!dailyRolloverPending) return null;

  return (
    <div className="aviso flex w-full flex-col items-center gap-2" role="status">
      <p>Chegou o verbete de hoje</p>
      <button type="button" className="tecla px-4" onClick={applyDailyRollover}>
        jogar
      </button>
    </div>
  );
}

function GameScreen() {
  const { state, type, backspace, submit, toasts, dismissToast, shakeToken } = useMatch();
  usePhysicalKeyboard({ onLetter: type, onEnter: submit, onBackspace: backspace });
  const states = keyboardStates(state);

  return (
    <Shell
      header={
        <>
          <Header />
          <ModeTabs />
        </>
      }
      board={
        <>
          {/* Positioned against Shell's <main>, not the viewport — see ToastHost.tsx. */}
          <ToastHost toasts={toasts} onDismiss={dismissToast} />
          <div className="flex w-full max-w-sm flex-col items-center gap-6">
            <DailyRolloverBanner />
            <div className="flex w-full flex-col gap-6">
              {state.boards.map((_board, index) => (
                <Board key={index} state={state} boardIndex={index} shakeToken={shakeToken} />
              ))}
            </div>
            <MatchOutcome />
          </div>
        </>
      }
      keyboard={
        <Keyboard
          states={states}
          boardCount={state.boards.length}
          onKey={type}
          onEnter={submit}
          onBackspace={backspace}
        />
      }
    />
  );
}

function App() {
  return (
    <MatchProvider>
      <GameScreen />
    </MatchProvider>
  );
}

export default App;
