import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GuessAnnouncer } from '../GuessAnnouncer';

afterEach(() => {
  cleanup();
});

describe('GuessAnnouncer', () => {
  it('renders two separate polite, atomic live regions — one for the row/outcome text, one for the definition', () => {
    render(
      <GuessAnnouncer
        text="Tentativa 1: C correta, A ausente, S ausente, A ausente, L ausente."
        definitionText="Definição de casal: par de pessoas que vivem juntas."
      />,
    );

    const regions = screen.getAllByRole('status');
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(region.getAttribute('aria-atomic')).toBe('true');
    }

    const texts = regions.map((region) => region.textContent);
    expect(texts).toContain('Tentativa 1: C correta, A ausente, S ausente, A ausente, L ausente.');
    expect(texts).toContain('Definição de casal: par de pessoas que vivem juntas.');
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
    const { rerender } = render(<GuessAnnouncer text="Tentativa 1: ..." definitionText="" />);
    rerender(<GuessAnnouncer text="Tentativa 1: ..." definitionText="Definição de casal: par de pessoas." />);

    const regions = screen.getAllByRole('status');
    const rowRegion = regions.find((r) => r.textContent === 'Tentativa 1: ...');
    const definitionRegion = regions.find((r) => r.textContent === 'Definição de casal: par de pessoas.');
    expect(rowRegion).toBeDefined();
    expect(definitionRegion).toBeDefined();
    expect(rowRegion).not.toBe(definitionRegion);
  });

  it('is visually hidden — sr-only, not a visible toast', () => {
    render(<GuessAnnouncer text="Tentativa 1: ..." definitionText="" />);
    for (const region of screen.getAllByRole('status')) {
      expect(region.className).toContain('sr-only');
    }
  });

  it('renders both regions empty before any guess has been announced, rather than omitting them', () => {
    // Both regions must exist from the very first render — a region that
    // only mounts once there is something to say would miss whichever
    // update happens to be its very first, since aria-live only announces a
    // CHANGE and a screen reader needs the region already present to pick
    // up that first change at all.
    render(<GuessAnnouncer text="" definitionText="" />);
    const regions = screen.getAllByRole('status');
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region.textContent).toBe('');
    }
  });
});
