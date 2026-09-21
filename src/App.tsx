import { keyboardStates } from './engine/keyboard';
import { MatchProvider } from './state/MatchProvider';
import { useMatch } from './state/useMatch';
import { usePhysicalKeyboard } from './state/usePhysicalKeyboard';
import { Board } from './ui/board/Board';
import { ToastHost } from './ui/feedback/ToastHost';
import { Header } from './ui/layout/Header';
import { Shell } from './ui/layout/Shell';
import { Keyboard } from './ui/keyboard/Keyboard';

/**
 * The end-of-match banner. No result modal in this task's scope (Task 21
 * adds the dictionary-entry ResultModal) — just enough for a player to see
 * the outcome and start again, which is everything Solo infinite needs.
 */
function MatchOutcome() {
  const { state, newMatch } = useMatch();
  if (state.status === 'playing') return null;

  const board = state.boards[0];
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-lead">
        {state.status === 'won' ? 'Você acertou!' : `Não foi dessa vez. A palavra era "${board?.answer ?? ''}".`}
      </p>
      <button type="button" className="tecla px-4" onClick={newMatch}>
        nova palavra
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
      header={<Header />}
      board={
        <>
          {/* Positioned against Shell's <main>, not the viewport — see ToastHost.tsx. */}
          <ToastHost toasts={toasts} onDismiss={dismissToast} />
          <div className="flex w-full max-w-sm flex-col items-center gap-6">
            <Board state={state} boardIndex={0} shakeToken={shakeToken} />
            <MatchOutcome />
          </div>
        </>
      }
      keyboard={<Keyboard states={states} boardCount={1} onKey={type} onEnter={submit} onBackspace={backspace} />}
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
