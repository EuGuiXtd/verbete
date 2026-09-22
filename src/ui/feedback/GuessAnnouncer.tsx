export interface GuessAnnouncerProps {
  readonly text: string;
}

/**
 * The entire feedback channel for a player who receives no ink at all (see
 * this task's report — Task 25). Colour is how every tile and key in this
 * game communicates its result; a screen-reader user gets none of it, so
 * MatchProvider builds a pt-BR sentence after every accepted guess
 * (buildAnnouncement, src/state/announce.ts) and this is the one place it
 * is actually spoken.
 *
 * `sr-only`, not `ToastHost`'s visible `.aviso` treatment: a sighted player
 * already has the board itself for this information — this element exists
 * purely for assistive technology and must never be seen or take up layout
 * space. `role="status"` + `aria-live="polite"` mirrors `ToastHost`'s own
 * region (a second, independent live region existing alongside it is fine —
 * both are polite, so an assistive technology queues them rather than
 * interrupting one with the other). `aria-atomic="true"` is the one thing
 * that differs from `ToastHost`: every announcement here replaces the last
 * IN FULL ("Linha 2: ..." fully replacing "Linha 1: ..."), and the two
 * strings share a long common prefix/shape — without `aria-atomic`, a
 * browser is free to announce only the CHANGED substring, which for this
 * template would routinely be just the trailing half of the sentence.
 */
export function GuessAnnouncer({ text }: GuessAnnouncerProps) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
