import { keyboardStates } from './engine/keyboard';
import { MatchProvider } from './state/MatchProvider';
import { useMatch } from './state/useMatch';
import { usePhysicalKeyboard } from './state/usePhysicalKeyboard';
import { Board } from './ui/board/Board';
import { blurOnMouseActivation } from './ui/blurOnMouseActivation';
import { ToastHost } from './ui/feedback/ToastHost';
import { Header } from './ui/layout/Header';
import { ModeTabs } from './ui/layout/ModeTabs';
import { Shell } from './ui/layout/Shell';
import { Keyboard } from './ui/keyboard/Keyboard';
import { ResultModal } from './ui/modals/ResultModal';
import type { MouseEvent } from 'react';

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
      <button
        type="button"
        className="tecla px-4"
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          blurOnMouseActivation(event);
          applyDailyRollover();
        }}
      >
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
          </div>
          {/*
            Task 21: the end-of-match reveal. Renders nothing while
            state.status === 'playing' — see ResultModal's own doc comment
            for why it replaces the old inline MatchOutcome status line.
          */}
          <ResultModal />
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
