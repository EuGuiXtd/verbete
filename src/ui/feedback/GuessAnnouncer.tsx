export interface GuessAnnouncerProps {
  readonly text: string;
  /**
   * The dictionary-definition sentence, once it resolves — see
   * `buildDefinitionsAnnouncement`'s own doc comment (src/state/announce.ts)
   * for why this is spoken through its OWN region rather than appended to
   * `text` above (Task 25 fix round 2, R2).
   */
  readonly definitionText: string;
  /**
   * The insertion point's new house, once the player moves it on purpose
   * (feedback round 1, item 3) — see `buildCursorAnnouncement` in
   * src/state/announce.ts. A third region for the same reason the second one
   * exists: this one changes far more often than either of the others, and
   * putting it in the atomic row/outcome region would both re-read that
   * whole sentence on every arrow key AND destroy a summary the player may
   * not have finished hearing.
   */
  readonly positionText: string;
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
 * region (a third, independent live region existing alongside it is fine —
 * all are polite, so an assistive technology queues them rather than
 * interrupting one with another). `aria-atomic="true"` is the one thing
 * that differs from `ToastHost`: every announcement here replaces the last
 * IN FULL ("Tentativa 2: ..." fully replacing "Tentativa 1: ..."), and the two
 * strings share a long common prefix/shape — without `aria-atomic`, a
 * browser is free to announce only the CHANGED substring, which for this
 * template would routinely be just the trailing half of the sentence.
 *
 * TWO regions, not one (Task 25 fix round 2, R2): the definition sentence
 * used to be appended to `text` once it resolved, which — because this
 * region is atomic — forced a screen reader to re-read the ENTIRE
 * finishing-guess sentence (the last row's five per-letter results, then
 * the outcome line) just to reach a few new words tacked on the end, every
 * single match. Its own region means only the genuinely new text is ever
 * spoken. Both regions are mounted unconditionally from the very first
 * render, exactly like the single region before them — an empty region
 * that only mounts once there is something to say would miss whichever
 * update happens to be its very first.
 */
export function GuessAnnouncer({ text, definitionText, positionText }: GuessAnnouncerProps) {
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {text}
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {definitionText}
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {positionText}
      </div>
    </>
  );
}
