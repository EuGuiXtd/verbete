/**
 * Feedback round 1, item 1 — the one the owner led with: "cores confusas em
 * todos os temas [...] poderia ter um mapa explicando o que cada cor
 * significa."
 *
 * The three tile states were designed to be self-explanatory (ink coverage,
 * not a traffic light — see src/styles/tokens.css) and, for the person who
 * commissioned the game, they were not. Measuring the palette first said the
 * separation itself is fine: the two inked fills are 3.01:1 apart in light
 * and 3.22:1 in dark, both above the 3:1 floor a non-text difference has to
 * clear, with a 57/113-level greyscale gap and a CIE76 dE of 64/57 on top of
 * that. Nothing was ever wrong with telling them APART. What was missing is
 * that nothing on screen ever said what either one MEANT, and the only place
 * that did was three paragraphs deep inside a dialog behind a "?" — so the
 * fix is a caption, not a repaint.
 *
 * It renders the real thing rather than a drawing of it: each swatch is the
 * identical `.sorte` + state class src/ui/board/Tile.tsx puts on the board
 * (`.legenda-sorte` in index.css only shrinks the box and the glyph), so the
 * legend cannot drift from the board it explains, in either theme, and a
 * future change to the ink is a change to both at once by construction.
 *
 * The swatches are `aria-hidden` and the labels are not: every scored tile
 * already announces its own state in words (Tile.tsx's `STATE_LABEL`), so to
 * a screen reader this is a three-item reference list, not a fourth copy of
 * the board.
 */

interface LegendEntry {
  readonly className: string;
  readonly label: string;
}

/**
 * Deliberately parallel phrasing — "lugar certo" against "lugar errado" —
 * because the distinction the player keeps losing is exactly the PLACE: the
 * letter itself is always one they just typed, so naming the letter
 * ("correta") explains nothing they did not already know. "não existe" is
 * the third, different kind of answer and is worded differently on purpose.
 * Kept compatible with the vocabulary the live region already speaks (see
 * src/state/announce.ts's `TILE_LABEL`) without being a verbatim copy of it:
 * that list is read aloud mid-sentence, this one is read standing alone.
 */
const ENTRIES: readonly LegendEntry[] = [
  { className: 'sorte sorte-certa legenda-sorte', label: 'lugar certo' },
  { className: 'sorte sorte-presente legenda-sorte', label: 'lugar errado' },
  { className: 'sorte sorte-ausente legenda-sorte', label: 'não existe' },
];

export interface LegendProps {
  /**
   * `true` inside HelpModal, where there is room to breathe and the list can
   * run down the page. The game screen itself gets the one-line form, which
   * is the whole point of it fitting above a Quarteto board on a phone.
   */
  readonly stacked?: boolean;
}

export function Legend({ stacked = false }: LegendProps) {
  return (
    <ul
      aria-label="O que cada bloco quer dizer"
      className={
        stacked
          ? 'flex flex-col gap-2 text-small'
          : 'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-micro text-ghost'
      }
    >
      {ENTRIES.map((entry) => (
        <li key={entry.label} className="flex items-center gap-1.5">
          {/*
            "A" on all three rather than three different letters: a legend
            spelling out a word would read as a guess someone made, and this
            is a key, not a row. The letter has to be there at all because
            the absent state's whole appearance is a ghosted letter in an
            un-inked block — an empty swatch would show only half of it.
          */}
          <span className={entry.className} aria-hidden="true">
            A
          </span>
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
