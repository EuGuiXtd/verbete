import { keyboardStates } from './engine/keyboard';
import { MatchProvider } from './state/MatchProvider';
import { useMatch } from './state/useMatch';
import { usePhysicalKeyboard } from './state/usePhysicalKeyboard';
import { BoardGrid } from './ui/board/BoardGrid';
import { blurOnMouseActivation } from './ui/blurOnMouseActivation';
import { GuessAnnouncer } from './ui/feedback/GuessAnnouncer';
import { ToastHost } from './ui/feedback/ToastHost';
import { Header } from './ui/layout/Header';
import { Legend } from './ui/layout/Legend';
import { ModeTabs } from './ui/layout/ModeTabs';
import { Shell } from './ui/layout/Shell';
import { Keyboard } from './ui/keyboard/Keyboard';
import { ResultModal } from './ui/modals/ResultModal';
import { UpdatePrompt } from './ui/feedback/UpdatePrompt';
import { useCallback } from 'react';
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
  const {
    state,
    type,
    backspace,
    moveCursor,
    submit,
    toasts,
    dismissToast,
    shakeToken,
    announcement,
    definitionAnnouncement,
    positionAnnouncement,
  } = useMatch();
  // The arrow keys arrive as a DIRECTION and leave as a house number: the
  // hook has no business knowing where the cursor currently is, and the
  // engine has no business knowing which key was pressed. Both ends of the
  // clamp are the engine's (see its MOVE_CURSOR case), so `state.cursor + 1`
  // from the last house, and the past-the-end position a complete draft
  // parks in, both resolve there rather than here.
  const moveCursorBy = useCallback(
    (delta: number) => { moveCursor(state.cursor + delta); },
    [moveCursor, state.cursor],
  );
  usePhysicalKeyboard({
    onLetter: type,
    onEnter: submit,
    onBackspace: backspace,
    onMoveCursor: moveCursorBy,
  });
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
          {/*
            The entire feedback channel for a player using a screen reader —
            see GuessAnnouncer's own doc comment. Rendered once here, outside
            ToastHost, since it has nothing to do with rejection toasts and
            must never be positioned or visible.
          */}
          <GuessAnnouncer
            text={announcement}
            definitionText={definitionAnnouncement}
            positionText={positionAnnouncement}
          />
          {/* Positioned against Shell's <main>, not the viewport — see ToastHost.tsx. */}
          <ToastHost toasts={toasts} onDismiss={dismissToast} />
          {/*
            No `max-w-sm` here any more: BoardGrid.tsx owns its own width per
            `state.boards.length` (Solo stays at `max-w-sm`; Dueto and
            Quarteto need more room than that to lay two or four boards out
            side by side — see BoardGrid's own doc comment).
          */}
          <div className="flex w-full flex-col items-center gap-4">
            <DailyRolloverBanner />
            {/*
              Feedback round 1, item 1: the colour map, on screen rather than
              three paragraphs into a dialog behind a "?" — see Legend.tsx's
              own doc comment for why a caption and not a repaint. Above the
              boards, not below them, so it is the thing a first-time player
              reads before their first guess rather than after it, and inside
              this scrolling column rather than pinned to the header so a
              short phone playing Quarteto spends its scarce vertical space
              on the board.
            */}
            <Legend />
            {/*
              Feedback round 1, item 3: tapping a house in the active row
              moves the insertion point there. BoardGrid narrows this to the
              one row it can apply to — see Board.tsx.
            */}
            <BoardGrid state={state} shakeToken={shakeToken} onSelectCell={moveCursor} />
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
      {/*
        Outside MatchProvider's own UI, deliberately: an update is a
        page-level event, not tied to whichever variant/mode is on screen.
        See UpdatePrompt's own doc comment for why this exists.
      */}
      <UpdatePrompt />
    </MatchProvider>
  );
}

export default App;
