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
});
