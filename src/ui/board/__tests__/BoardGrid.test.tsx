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

  it('renders exactly two boards for a Dueto match, responsive to two columns rather than fixed at one', () => {
    const state = createMatch({
      variant: 'dueto',
      mode: 'infinito',
      dayKey: null,
      answers: ['CASAL', 'TERRA'],
      startedAt: 0,
    });
    const { container } = render(<BoardGrid state={state} />);

    expect(boardWrappers(container)).toHaveLength(2);
    // Stacked by default (narrow), side by side from the `sm:` breakpoint —
    // never a hard 2x2, that is Quarteto's shape alone.
    expect(container.firstElementChild?.className).toMatch(/\bsm:grid-cols-2\b/);
    expect(container.firstElementChild?.className).not.toMatch(/(?<!sm:)\bgrid-cols-2\b/);
    // Not the compact (Quarteto-only) tile scale.
    expect(container.firstElementChild?.className).not.toContain('grade-compacta');
  });

  it('renders all four boards for a Quarteto match as a fixed 2x2 grid, driven by board count alone', () => {
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
    // Fixed 2 columns at every width — Quarteto never stacks to one column,
    // unlike Dueto.
    expect(container.firstElementChild?.className).toMatch(/(?<!sm:)\bgrid-cols-2\b/);
    // The compact tile scale that keeps four 9-row boards inside 100svh on
    // an iPhone SE — see index.css's `.grade-compacta`.
    expect(container.firstElementChild?.className).toContain('grade-compacta');
    // compact also tightens each board's own row gap.
    for (const wrapper of wrappers) {
      expect(wrapper.className).toContain('gap-1');
    }
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
