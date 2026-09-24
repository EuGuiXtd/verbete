import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GuessAnnouncer } from '../GuessAnnouncer';

afterEach(() => {
  cleanup();
});

describe('GuessAnnouncer', () => {
  it('renders three separate polite, atomic live regions — row/outcome, definition, and insertion point', () => {
    render(
      <GuessAnnouncer
        text="Tentativa 1: C correta, A ausente, S ausente, A ausente, L ausente."
        definitionText="Definição de casal: par de pessoas que vivem juntas."
        positionText="Posição 3, vazia."
      />,
    );

    const regions = screen.getAllByRole('status');
    expect(regions).toHaveLength(3);
    for (const region of regions) {
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(region.getAttribute('aria-atomic')).toBe('true');
    }

    const texts = regions.map((region) => region.textContent);
    expect(texts).toContain('Tentativa 1: C correta, A ausente, S ausente, A ausente, L ausente.');
    expect(texts).toContain('Definição de casal: par de pessoas que vivem juntas.');
    expect(texts).toContain('Posição 3, vazia.');
  });

  /**
   * Feedback round 1, item 3, and the same argument round 2 of Task 25 made
   * for the definition: the insertion point moves far more often than either
   * of the other two regions changes, so folding it into the atomic
   * row/outcome region would re-read a whole five-letter row summary on
   * every arrow key AND destroy a summary the player may not have finished
   * hearing. This is the assertion that would catch that, since every other
   * one here would pass on a single shared string.
   */
  it('keeps the insertion point out of the row/outcome region entirely', () => {
    const { rerender } = render(
      <GuessAnnouncer text="Tentativa 1: ..." definitionText="" positionText="" />,
    );
    rerender(<GuessAnnouncer text="Tentativa 1: ..." definitionText="" positionText="Posição 2, C." />);

    const regions = screen.getAllByRole('status');
    const rowRegion = regions.find((r) => r.textContent === 'Tentativa 1: ...');
    const positionRegion = regions.find((r) => r.textContent === 'Posição 2, C.');
    expect(rowRegion).toBeDefined();
    expect(positionRegion).toBeDefined();
    expect(rowRegion).not.toBe(positionRegion);
  });

  // Task 25 fix round 2 (R2): the definition used to be appended to the
  // SAME atomic region as the row/outcome text, which forced a screen
  // reader to re-read the whole finishing-guess sentence just to reach a
  // few new words. This is the one assertion that actually proves the fix:
  // updating `definitionText` alone must never touch the OTHER region's
  // own text, which is what "two separate regions" is for in the first
  // place — appending to one shared string could pass every assertion
  // above while still reintroducing the bug.
  it('keeps the two regions independent — the definition never gets folded into the row/outcome text', () => {
    const { rerender } = render(
      <GuessAnnouncer text="Tentativa 1: ..." definitionText="" positionText="" />,
    );
    rerender(
      <GuessAnnouncer
        text="Tentativa 1: ..."
        definitionText="Definição de casal: par de pessoas."
        positionText=""
      />,
    );

    const regions = screen.getAllByRole('status');
    const rowRegion = regions.find((r) => r.textContent === 'Tentativa 1: ...');
    const definitionRegion = regions.find((r) => r.textContent === 'Definição de casal: par de pessoas.');
    expect(rowRegion).toBeDefined();
    expect(definitionRegion).toBeDefined();
    expect(rowRegion).not.toBe(definitionRegion);
  });

  it('is visually hidden — sr-only, not a visible toast', () => {
    render(<GuessAnnouncer text="Tentativa 1: ..." definitionText="" positionText="" />);
    for (const region of screen.getAllByRole('status')) {
      expect(region.className).toContain('sr-only');
    }
  });

  it('renders all three regions empty before anything has been announced, rather than omitting them', () => {
    // Both regions must exist from the very first render — a region that
    // only mounts once there is something to say would miss whichever
    // update happens to be its very first, since aria-live only announces a
    // CHANGE and a screen reader needs the region already present to pick
    // up that first change at all.
    render(<GuessAnnouncer text="" definitionText="" positionText="" />);
    const regions = screen.getAllByRole('status');
    expect(regions).toHaveLength(3);
    for (const region of regions) {
      expect(region.textContent).toBe('');
    }
  });
});
