import { VARIANTS, VARIANT_LABEL, MODE_LABEL } from '../../engine/constants';
import { useDefinition } from '../../state/useDefinition';
import { loadHistory } from '../../storage/repository';
import { Modal } from './Modal';

export interface HistoryModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface WordEntryProps {
  readonly word: string;
}

/**
 * One word from a finished match, with its dictionary definition —
 * `history` is the only screen where a player can revisit a word they
 * already learned, so this repeats `ResultModal`'s own headword-plus-gloss
 * shape (see `VerbeteEntry` there) rather than a bare word in a table cell.
 * `useDefinition` lives in its own component for the same reason it does in
 * `ResultModal`: a match can carry a variable number of boards (1 for Solo,
 * up to 4 for Quarteto), and calling a hook a variable number of times
 * inside one component would break the rules of hooks.
 */
function WordEntry({ word }: WordEntryProps) {
  const { definition } = useDefinition(word);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className="font-semibold">{word}</span>
      {definition && <span className="text-small italic text-ghost">{definition.gloss}</span>}
    </span>
  );
}

/**
 * Past matches: date, variant, mode, result and every board's word (with
 * its definition, once it loads) — the only place a player can look back at
 * what they played. Read straight from `loadHistory()` via the repository
 * (this task's own scope: "Consumes: ... history from the repository"),
 * newest first, since that is the order a player actually wants to scroll
 * through their own history in.
 *
 * `entry.answers` is defensively coerced to an array before use: an entry
 * appended before Task 22 has no such field on disk (see schema.ts's own
 * comment on `HistoryEntry.answers`), and a corrupt or hand-edited record is
 * always possible — this must never crash the whole history list over one
 * bad entry, the same defensive posture `MatchProvider.tsx`'s
 * `hasReplayableAnswers` already takes for a stored `ProgressRecord`.
 */
export function HistoryModal({ isOpen, onClose }: HistoryModalProps) {
  if (!isOpen) return null;

  const entries = [...loadHistory()].sort((a, b) => b.finishedAt - a.finishedAt);

  return (
    <Modal titleId="historico-titulo" title="Histórico" onClose={onClose}>
      {entries.length === 0 ? (
        <p className="text-body text-ghost">Nenhuma partida ainda.</p>
      ) : (
        <ul className="space-y-5">
          {entries.map((entry, index) => {
            const answers = Array.isArray(entry.answers) ? entry.answers : [];
            const maxAttempts = VARIANTS[entry.variant].attempts;
            const score = entry.won ? `${String(entry.attempts)}/${String(maxAttempts)}` : `X/${String(maxAttempts)}`;
            return (
              <li
                key={`${String(entry.finishedAt)}-${String(index)}`}
                className="border-t border-rule pt-5 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small text-ghost">
                  <span>{DATE_FORMAT.format(new Date(entry.finishedAt))}</span>
                  <span>
                    {VARIANT_LABEL[entry.variant]} &middot; {MODE_LABEL[entry.mode]}
                  </span>
                  <span className="font-semibold text-ink">{score}</span>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {answers.map((word, wordIndex) => (
                    <WordEntry key={`${word}-${String(wordIndex)}`} word={word} />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
