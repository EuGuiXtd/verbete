import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Row } from '../Row';
import type { RowCell } from '../Row';

afterEach(() => {
  cleanup();
});

describe('Row', () => {
  it('names every state in Portuguese for a scored row — a label of only the letter is a bug', () => {
    const cells: RowCell[] = [
      { letter: 'p', state: 'correct' },
      { letter: 'r', state: 'present' },
      { letter: 'a', state: 'absent' },
      { letter: 't', state: 'correct' },
      { letter: 'o', state: 'present' },
    ];
    render(<Row cells={cells} />);

    const tiles = screen.getAllByRole('img');
    expect(tiles).toHaveLength(5);

    // Exact expected labels: this fails if any state's Portuguese wording
    // regresses, and it fails just as hard if a label were ever reduced to
    // the bare letter (colour-only feedback with nothing for a screen
    // reader user).
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'P, na posição correta',
      'R, existe na palavra, posição errada',
      'A, não existe na palavra',
      'T, na posição correta',
      'O, existe na palavra, posição errada',
    ]);

    tiles.forEach((tile, index) => {
      const bareLetter = cells[index]!.letter.toUpperCase();
      expect(tile.getAttribute('aria-label')).not.toBe(bareLetter);
    });
  });

  it('carries the shake class only when told to, and never by default', () => {
    const cells: RowCell[] = [
      { letter: '', state: 'empty' },
      { letter: '', state: 'empty' },
      { letter: '', state: 'empty' },
      { letter: '', state: 'empty' },
      { letter: '', state: 'empty' },
    ];

    const { container: plain } = render(<Row cells={cells} />);
    expect(plain.firstElementChild?.className).not.toContain('tremor');
    cleanup();

    const { container: shaking } = render(<Row cells={cells} shake />);
    expect(shaking.firstElementChild?.className).toContain('tremor');
  });

  it('shows the board in uppercase while leaving the cells it was given untouched', () => {
    const cells: RowCell[] = [
      { letter: 'p', state: 'correct' },
      { letter: 'r', state: 'correct' },
      { letter: 'a', state: 'correct' },
      { letter: 't', state: 'correct' },
      { letter: 'o', state: 'correct' },
    ];
    const frozen = structuredClone(cells);

    render(<Row cells={cells} />);

    expect(screen.getByText('P')).toBeDefined();
    expect(screen.queryByText('p')).toBeNull();
    expect(cells).toEqual(frozen);
  });
});
