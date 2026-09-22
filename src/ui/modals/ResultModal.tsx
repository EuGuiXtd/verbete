import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useMatch } from '../../state/useMatch';
import { useDefinition } from '../../state/useDefinition';
import { useShare } from '../../state/useShare';
import type { ShareOutcome } from '../../state/useShare';
import { blurOnMouseActivation } from '../blurOnMouseActivation';
import { useFocusTrap } from './useFocusTrap';

const STATUS_HEADLINE: Record<'won' | 'lost', string> = {
  won: 'Você acertou!',
  lost: 'Não foi dessa vez',
};

/** How long "copiado" stays up after a successful report before reverting to the quiet default label. */
const COPIED_FEEDBACK_MS = 2000;

/**
 * The two states the gloss slot can be in other than "here is the
 * definition". Before these existed the slot simply rendered nothing, so a
 * word whose definition was still loading and a word that had none looked
 * identical — and both looked like the app had broken halfway through the
 * one screen the whole game builds to. `buildDefinitionsAnnouncement` in
 * src/state/announce.ts says the same two things to a screen reader, in the
 * same words, so the channels agree.
 */
const DEFINITION_LOADING = 'Carregando a definição…';
export const DEFINITION_MISSING = 'Sem definição disponível para esta palavra.';

/** What the share control's label swaps to for each outcome `useShare` can report. 'failed' shows nothing — see below. */
const SHARE_FEEDBACK: Record<Exclude<ShareOutcome, 'failed'>, string> = {
  shared: 'compartilhado!',
  copied: 'copiado!',
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No Clipboard API (insecure context, unsupported browser, permission
    // denied): fails silently. This is a quiet convenience control, not a
    // feature the game depends on — there is nothing useful to show a
    // player for "your clipboard didn't take it".
    return false;
  }
}

interface VerbeteEntryProps {
  readonly answer: string;
}

/**
 * One dictionary entry: headword, part-of-speech abbreviation (when the
 * generated definition carried one), the definition itself — or, in its
 * place, an honest line saying it is still loading or that there is none
 * (every shipped answer now has one, enforced by `assertBuildInvariants`,
 * but the chunk is fetched over the network on a dynamic import and can
 * fail; silence there reads as a broken app, not as an answer) — a link to
 * the real Wikcionário entry, the CC BY-SA attribution line that link alone
 * does not carry, and the quiet "palavra errada?" report control
 * (understated on purpose; see the comment on the button itself).
 *
 * `useDefinition` lives here, not in `ResultModal`, specifically so
 * `ResultModal` can render one `VerbeteEntry` per board via `.map` — a
 * variable number of hook calls inside a single component (`boards.length`
 * differs across Solo/Dueto/Quarteto) would break the rules of hooks;
 * moving the hook into its own per-board component sidesteps that, since
 * each `VerbeteEntry` instance calls it exactly once.
 */
function VerbeteEntry({ answer }: VerbeteEntryProps) {
  const { definition, isLoading } = useDefinition(answer);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handleReport = (event: MouseEvent<HTMLButtonElement>) => {
    blurOnMouseActivation(event);
    void copyToClipboard(answer).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, COPIED_FEEDBACK_MS);
    });
  };

  return (
    <article className="border-t border-rule pt-5 first:border-t-0 first:pt-0">
      <h3 className="flex flex-wrap items-baseline gap-x-3">
        {/*
          text-display, not text-headword: this is the one word the whole
          game has been pointed at revealing, set at the same scale the
          wordmark itself uses (Header.tsx's "ver·be·te") — the reveal
          should look like the game just told you what its name means, not
          like a slightly larger version of every other piece of body copy
          on this sheet.
        */}
        <span className="text-display font-semibold leading-none">{answer}</span>
        {definition && definition.abbrev !== '' && (
          <span className="text-body italic text-ghost">{definition.abbrev}</span>
        )}
      </h3>
      {definition ? (
        <p className="mt-3 max-w-[34rem] text-body">
          {/*
            The trailing space is a real character, not the `mr-2` margin: an
            extracted-text reading of this paragraph (a screen reader's, a
            copy-paste) sees no margins, and "1.forma particular de agir" is
            not what the sheet says.
          */}
          <span className="mr-2 font-semibold">1. </span>
          {definition.gloss}
        </p>
      ) : (
        <p className="mt-3 max-w-[34rem] text-body italic text-ghost">
          {isLoading ? DEFINITION_LOADING : DEFINITION_MISSING}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro italic text-ghost">
        <a
          href={`https://pt.wiktionary.org/wiki/${encodeURIComponent(answer)}`}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-rule underline-offset-2"
        >
          ver no Wikcionário
        </a>
        {/*
          Understated on purpose (see this task's brief): no icon, no red
          flag, same type size and weight as the Wikcionário link right next
          to it. A player meets a genuinely wrong answer perhaps once in
          months; this exists for that moment, not to advertise itself.
        */}
        <button type="button" className="underline decoration-rule underline-offset-2" onClick={handleReport}>
          {copied ? 'copiado!' : 'palavra errada?'}
        </button>
      </div>
      {/*
        CC BY-SA 4.0 attribution at the point of use. NOTICE.md stakes the
        compliance claim on the per-word Wikcionário link above being "the
        most robust way to credit the original authors AND to indicate that
        the material was adapted" — a bare hyperlink does the first and not
        the second, and the linked article cannot know that THIS project
        shortened and partly redacted its text. This line says both, beside
        the text it is about. Only rendered when there is adapted text to
        attribute.
      */}
      {definition && (
        <p className="mt-1 text-micro italic text-ghost">
          definição adaptada do Wikcionário ·{' '}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-rule underline-offset-2"
          >
            CC BY-SA 4.0
          </a>
        </p>
      )}
    </article>
  );
}

/**
 * Task 21's reveal: what every other task on this project's design has been
 * pointed at. `MatchOutcome` in App.tsx used to end a match with a single
 * line of inline text; this replaces it with the thing the game is actually
 * named for — the word's real dictionary entry, once a match is over, won
 * or lost.
 *
 * Dismissal is keyed off `(variant, mode, finishedAt)`, not a plain
 * "was it closed" boolean: closing this modal for one finished match must
 * not also suppress it for the NEXT match that finishes in the same
 * variant/mode slot, or when switching back to a different slot's own
 * already-finished match (its `finishedAt` differs from whatever the
 * player last dismissed). No effect needed to reset a dismissal — it falls
 * out of the key changing.
 *
 * Deliberately does NOT move focus to "fechar" (or anywhere) when it
 * appears. A first version did, and playtesting this exact task caught the
 * bug that causes: the same `Enter` keypress that just finished the match
 * (accepting the losing/winning guess) was still being processed by the
 * browser when the effect ran and focused the close button mid-keypress —
 * so that Enter's own `keyup` then activated the now-focused button and
 * closed the modal instantly, before it was ever visibly rendered. Same
 * failure family `blurOnMouseActivation.ts` and
 * `usePhysicalKeyboard.ts`'s `isButtonOwnedActivationKey` already exist to
 * prevent for the virtual keyboard; this modal avoids it by simply never
 * stealing focus from whatever the player's last keypress landed on.
 *
 * Task 25: Tab/Shift+Tab is trapped inside `.folha` via the same
 * `useFocusTrap` Modal.tsx uses, gated on `visible` since this component
 * (unlike Modal.tsx's children) never unmounts — see that hook's own doc
 * comment for why trapping Tab, specifically, cannot reintroduce the
 * mount-time steal this comment spends most of itself warning against.
 */
export function ResultModal() {
  const { state, active } = useMatch();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const share = useShare();
  const [shareFeedback, setShareFeedback] = useState<Exclude<ShareOutcome, 'failed'> | null>(null);
  const shareFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matchKey = `${active.variant}:${active.mode}:${String(state.finishedAt)}`;
  const visible = state.status !== 'playing' && dismissedKey !== matchKey;
  const sheetRef = useRef<HTMLDivElement>(null);
  // Task 25: the same Tab-trap Modal.tsx uses (see useFocusTrap's own doc
  // comment) — gated on `visible`, not a bare `true`, because this
  // component never unmounts the way Modal.tsx's children do; without the
  // gate the trap's keydown listener would stay attached (and its
  // "container is empty" preventDefault would fire on every Tab) even
  // while this dialog is hidden.
  useFocusTrap(sheetRef, visible);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissedKey(matchKey);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [visible, matchKey]);

  useEffect(
    () => () => {
      if (shareFeedbackTimeoutRef.current !== null) clearTimeout(shareFeedbackTimeoutRef.current);
    },
    [],
  );

  const handleShare = (event: MouseEvent<HTMLButtonElement>) => {
    blurOnMouseActivation(event);
    void share(state).then((outcome) => {
      // 'failed' covers both an unsupported browser and the player
      // dismissing the share sheet — see useShare's own doc comment for why
      // neither is worth surfacing here.
      if (outcome === 'failed') return;
      setShareFeedback(outcome);
      if (shareFeedbackTimeoutRef.current !== null) clearTimeout(shareFeedbackTimeoutRef.current);
      shareFeedbackTimeoutRef.current = setTimeout(() => {
        setShareFeedback(null);
      }, COPIED_FEEDBACK_MS);
    });
  };

  if (!visible) return null;
  // `visible` already narrowed state.status away from 'playing'.
  const headline = STATUS_HEADLINE[state.status as 'won' | 'lost'];

  return (
    <div
      className="cortina"
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) setDismissedKey(matchKey);
      }}
    >
      <div
        ref={sheetRef}
        className="folha"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resultado-titulo"
        aria-describedby="resultado-conteudo"
      >
        <div className="flex items-start justify-between gap-4">
          <p id="resultado-titulo" className="text-lead">
            {headline}
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-small text-ghost underline decoration-rule underline-offset-2"
              onClick={handleShare}
            >
              {shareFeedback ? SHARE_FEEDBACK[shareFeedback] : 'compartilhar'}
            </button>
            <button
              type="button"
              className="text-small text-ghost underline decoration-rule underline-offset-2"
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                blurOnMouseActivation(event);
                setDismissedKey(matchKey);
              }}
            >
              fechar
            </button>
          </div>
        </div>
        {/* The masthead-over-body hairline a printed dictionary page uses — see .folha-regua's own comment in index.css. */}
        <div className="folha-regua" />
        {/*
          Task 25 fix round 1 (F2): `aria-describedby` ties this dialog's
          accessible description to its actual content — every board's
          headword and gloss — so a screen reader announces it too if the
          player Tabs into this dialog, not only via the live-region
          sentence GuessAnnouncer.tsx already speaks the moment the match
          finishes (see MatchProvider.tsx's own doc comment on why that
          arrives as a second, later update once `loadDefinition` resolves).
          This dialog still never steals focus on mount (see this
          component's own doc comment above for exactly why not) — an id
          reference costs nothing extra and cannot reintroduce that bug.
        */}
        <div id="resultado-conteudo" className="space-y-6">
          {state.boards.map((board, index) => (
            <VerbeteEntry key={`${String(index)}-${board.answer}`} answer={board.answer} />
          ))}
        </div>
      </div>
    </div>
  );
}
