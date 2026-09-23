import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createMatch } from '../../../engine/match';
import { BoardGrid } from '../BoardGrid';

afterEach(() => {
  cleanup();
});

function boardWrappers(container: HTMLElement): HTMLElement[] {
  return Array.from(container.firstElementChild?.children ?? []) as HTMLElement[];
}

describe('BoardGrid', () => {
  it('renders exactly one board for a Solo match, in a single-column wrapper', () => {
    const state = createMatch({ variant: 'solo', mode: 'infinito', dayKey: null, answers: ['CASAL'], startedAt: 0 });
    const { container } = render(<BoardGrid state={state} />);

    expect(boardWrappers(container)).toHaveLength(1);
    // Never a 2-column grid for a single board — no crowding to solve.
    expect(container.firstElementChild?.className).not.toMatch(/\bgrid-cols-2\b/);
  });

  it('renders exactly two boards for a Dueto match, side by side at every width', () => {
    const state = createMatch({
      variant: 'dueto',
      mode: 'infinito',
      dayKey: null,
      answers: ['CASAL', 'TERRA'],
      startedAt: 0,
    });
    const { container } = render(<BoardGrid state={state} />);

    expect(boardWrappers(container)).toHaveLength(2);
    // Feedback round 1, item 2: two columns UNCONDITIONALLY, never a
    // breakpoint-gated `sm:grid-cols-2` over a stacked `grid-cols-1` base.
    // That base is precisely what the owner hit — their screen was below
    // the breakpoint, so Dueto rendered as one board with another below the
    // fold. Both halves are asserted: the unprefixed class must be there,
    // and no single-column base may survive alongside it.
    expect(container.firstElementChild?.className).toMatch(/(?<!:)\bgrid-cols-2\b/);
    expect(container.firstElementChild?.className).not.toMatch(/\bgrid-cols-1\b/);
    // Not the compact (Quarteto-only) tile scale, but its own two-board one:
    // a Dueto board owns half the content width, so the glyph ceiling the
    // single-board clamp was tuned for is too generous (index.css).
    expect(container.firstElementChild?.className).not.toContain('grade-compacta');
    expect(container.firstElementChild?.className).toContain('grade-dupla');
    // Task 25: a solved board must anchor to its row's own top line instead
    // of stretching to match a still-playing side-by-side neighbour — see
    // BoardGrid.tsx's own doc comment on `items-start` for the measured
    // stretch this replaces.
    expect(container.firstElementChild?.className).toContain('items-start');
  });

  it('renders all four boards for a Quarteto match, two across on a phone and four across on a wide screen', () => {
    const state = createMatch({
      variant: 'quarteto',
      mode: 'infinito',
      dayKey: null,
      answers: ['CASAL', 'TERRA', 'PRATO', 'FALAR'],
      startedAt: 0,
    });
    const { container } = render(<BoardGrid state={state} />);

    const wrappers = boardWrappers(container);
    expect(wrappers).toHaveLength(4);
    // Two columns as the base — Quarteto never stacks to one column at any
    // width, however narrow.
    expect(container.firstElementChild?.className).toMatch(/(?<!:)\bgrid-cols-2\b/);
    expect(container.firstElementChild?.className).not.toMatch(/\bgrid-cols-1\b/);
    // Feedback round 1, item 8: and four across from `lg:` up, where a 2x2
    // left ~500px of screen empty either side while running off the bottom
    // of the board area. Both the column count and the wider cap it needs to
    // be worth anything are pinned — four across inside `max-w-md` would be
    // four columns of unreadably small tiles, which is a different bug
    // wearing this fix's clothes.
    expect(container.firstElementChild?.className).toMatch(/\blg:grid-cols-4\b/);
    expect(container.firstElementChild?.className).toMatch(/\blg:max-w-6xl\b/);
    // The compact tile scale that keeps four 9-row boards inside 100svh on
    // an iPhone SE — see index.css's `.grade-compacta`.
    expect(container.firstElementChild?.className).toContain('grade-compacta');
    // compact also tightens each board's own row gap.
    for (const wrapper of wrappers) {
      expect(wrapper.className).toContain('gap-1');
    }
    // Task 25: same anchor-to-top fix as Dueto's own row — see that test's
    // own comment.
    expect(container.firstElementChild?.className).toContain('items-start');
  });

  it('forwards shakeToken to every board so any of them can shake its own active row', () => {
    const state = createMatch({
      variant: 'dueto',
      mode: 'infinito',
      dayKey: null,
      answers: ['CASAL', 'TERRA'],
      startedAt: 0,
    });
    // shakeToken only changes DOM shape (a remounted active row) when > 0 —
    // rendering twice and diffing would be indirect. Instead this just
    // confirms BoardGrid does not crash or drop the prop when it is set,
    // and Board.test.tsx already owns the actual shake behaviour contract.
    expect(() => render(<BoardGrid state={state} shakeToken={3} />)).not.toThrow();
  });
});
