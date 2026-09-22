import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createMatch, reduce } from '../../../engine/match';
import type { EngineDeps, MatchState } from '../../../engine/match';
import { Board } from '../Board';

afterEach(() => {
  cleanup();
});

const deps: EngineDeps = { isValidGuess: () => true, now: () => 1_000 };

function type(state: MatchState, word: string): MatchState {
  let next = state;
  for (const letter of word) next = reduce(next, { type: 'TYPE', letter }, deps).state;
  return reduce(next, { type: 'SUBMIT' }, deps).state;
}

function typeDraft(state: MatchState, letters: string): MatchState {
  let next = state;
  for (const letter of letters) next = reduce(next, { type: 'TYPE', letter }, deps).state;
  return next;
}

function make(): MatchState {
  return createMatch({ variant: 'solo', mode: 'infinito', dayKey: null, answers: ['CASAL'], startedAt: 0 });
}

function rowsOf(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll(':scope > div > div'));
}

describe('Board', () => {
  it('renders maxAttempts rows: a completed guess, the active draft, and empty rows after it', () => {
    let state = make();
    state = type(state, 'TERRA'); // wrong guess, board not solved
    state = typeDraft(state, 'CA');

    const { container } = render(<Board state={state} boardIndex={0} />);

    const rows = rowsOf(container);
    expect(rows).toHaveLength(6); // solo: 6 attempts

    // Row 0: the completed, scored guess.
    expect(screen.getAllByRole('img')).toHaveLength(5);

    // Row 1: the active draft — "CA" typed, three empty houses after it.
    const draftRow = rows[1]!;
    expect(within(draftRow).getByText('C')).toBeDefined();
    expect(within(draftRow).getByText('A')).toBeDefined();

    // Row 1's un-typed cells and every later row are empty and hidden from
    // the accessibility tree.
    const emptyInDraftRow = draftRow.querySelectorAll('[aria-hidden="true"]');
    expect(emptyInDraftRow).toHaveLength(3);
    for (const row of rows.slice(2)) {
      expect(row.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
    }
  });

  it('freezes a solved board: stops rendering rows past the solving guess and mutes it', () => {
    let state = make();
    state = type(state, 'CASAL'); // solves it on the first guess

    const { container } = render(<Board state={state} boardIndex={0} />);

    // Only the one solving row — no draft row, no empty padding up to
    // maxAttempts (6). This is the "freezes for free" contract: Board does
    // not add rows boardRows() did not hand it.
    const rows = rowsOf(container);
    expect(rows).toHaveLength(1);
    expect(screen.getAllByRole('img')).toHaveLength(5);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('aria-disabled')).toBe('true');
  });

  it('does not mute or shorten a board that is still playing', () => {
    const state = make();
    const { container } = render(<Board state={state} boardIndex={0} />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.hasAttribute('aria-disabled')).toBe(false);
    expect(rowsOf(container)).toHaveLength(6);
  });

  // Task 25: a sighted affordance fix, carried from Task 23's review — see
  // this task's report for why `opacity-60` alone was judged too subtle at
  // Quarteto's compact tile size to read as "done" rather than "not started".
  describe('the "resolvido" caption', () => {
    it('appears, hidden from the accessibility tree, once a board solves', () => {
      let state = make();
      state = type(state, 'CASAL'); // solves it
      const { container } = render(<Board state={state} boardIndex={0} />);

      const caption = screen.getByText('resolvido');
      expect(caption.getAttribute('aria-hidden')).toBe('true');
      // Still a `<p>`, not a `<div>` — rowsOf's `:scope > div > div` selector
      // (used throughout this file) must never pick it up as a row.
      expect(caption.tagName).toBe('P');
      expect(rowsOf(container)).toHaveLength(1); // unaffected by the caption
    });

    it('never appears on a board that is still playing', () => {
      const state = make();
      render(<Board state={state} boardIndex={0} />);
      expect(screen.queryByText('resolvido')).toBeNull();
    });
  });

  describe('shakeToken', () => {
    it('does not shake any row when shakeToken is 0 (no rejection yet)', () => {
      const state = type(make(), 'TERRA');
      const { container } = render(<Board state={state} boardIndex={0} shakeToken={0} />);

      const rows = rowsOf(container);
      for (const row of rows) expect(row.className).not.toContain('tremor');
    });

    it('shakes only the active row, not a scored row or an empty padding row', () => {
      const state = type(make(), 'TERRA'); // row 0 scored, row 1 is the active draft
      const { container } = render(<Board state={state} boardIndex={0} shakeToken={1} />);

      const rows = rowsOf(container);
      expect(rows[0]!.className).not.toContain('tremor'); // scored, not active
      expect(rows[1]!.className).toContain('tremor'); // the active draft row
      for (const row of rows.slice(2)) expect(row.className).not.toContain('tremor');
    });

    it('never shakes a solved board — it has no active row', () => {
      const state = type(make(), 'CASAL'); // solves it
      const { container } = render(<Board state={state} boardIndex={0} shakeToken={1} />);

      const rows = rowsOf(container);
      for (const row of rows) expect(row.className).not.toContain('tremor');
    });

    it('forces a fresh DOM node for the active row on each new shakeToken, so identical consecutive rejections both play', () => {
      const state = make();
      const { container, rerender } = render(<Board state={state} boardIndex={0} shakeToken={1} />);
      const firstNode = rowsOf(container)[0];

      rerender(<Board state={state} boardIndex={0} shakeToken={2} />);
      const secondNode = rowsOf(container)[0];

      expect(secondNode).not.toBe(firstNode);
    });
  });
});
