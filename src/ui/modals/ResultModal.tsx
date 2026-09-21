import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useMatch } from '../../state/useMatch';
import { useDefinition } from '../../state/useDefinition';
import { blurOnMouseActivation } from '../blurOnMouseActivation';

const STATUS_HEADLINE: Record<'won' | 'lost', string> = {
  won: 'Você acertou!',
  lost: 'Não foi dessa vez',
};

/** How long "copiado" stays up after a successful report before reverting to the quiet default label. */
const COPIED_FEEDBACK_MS = 2000;

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
 * generated definition carried one), the definition itself (omitted
 * entirely for the ~5% of answers with no usable gloss — see
 * scripts/build-dictionary.ts's buildDefinition), a link to the real
 * Wikcionário entry, and the quiet "palavra errada?" report control (see
 * this task's report for why the answer list ships with an online-report
 * escape hatch instead of a fully general offline filter).
 *
 * `useDefinition` lives here, not in `ResultModal`, specifically so
 * `ResultModal` can render one `VerbeteEntry` per board via `.map` — a
 * variable number of hook calls inside a single component (`boards.length`
 * differs across Solo/Dueto/Quarteto) would break the rules of hooks;
 * moving the hook into its own per-board component sidesteps that, since
 * each `VerbeteEntry` instance calls it exactly once.
 */
function VerbeteEntry({ answer }: VerbeteEntryProps) {
  const { definition } = useDefinition(answer);
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
      {definition && (
        <p className="mt-3 max-w-[34rem] text-body">
          <span className="mr-2 font-semibold">1.</span>
          {definition.gloss}
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
          {copied ? 'copiado' : 'palavra errada?'}
        </button>
      </div>
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
 */
export function ResultModal() {
  const { state, active } = useMatch();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const matchKey = `${active.variant}:${active.mode}:${String(state.finishedAt)}`;
  const visible = state.status !== 'playing' && dismissedKey !== matchKey;

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
      <div className="folha" role="dialog" aria-modal="true" aria-labelledby="resultado-titulo">
        <div className="flex items-start justify-between gap-4">
          <p id="resultado-titulo" className="text-lead">
            {headline}
          </p>
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
        {/* The masthead-over-body hairline a printed dictionary page uses — see .folha-regua's own comment in index.css. */}
        <div className="folha-regua" />
        <div className="space-y-6">
          {state.boards.map((board, index) => (
            <VerbeteEntry key={`${String(index)}-${board.answer}`} answer={board.answer} />
          ))}
        </div>
      </div>
    </div>
  );
}
