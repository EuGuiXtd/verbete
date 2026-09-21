import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Shell } from '../Shell';

afterEach(() => {
  cleanup();
});

describe('Shell', () => {
  it('lays out header, board and keyboard in that order', () => {
    render(
      <Shell
        header={<div data-testid="header">cabeçalho</div>}
        board={<div data-testid="board">tabuleiro</div>}
        keyboard={<div data-testid="keyboard">teclado</div>}
      />,
    );

    expect(screen.getByTestId('header')).toBeDefined();
    expect(screen.getByTestId('board')).toBeDefined();
    expect(screen.getByTestId('keyboard')).toBeDefined();

    const header = screen.getByTestId('header');
    const board = screen.getByTestId('board');
    const keyboard = screen.getByTestId('keyboard');
    // DOCUMENT_POSITION_FOLLOWING (4): compareDocumentPosition(b) on `a`
    // returns it when `b` comes after `a` in the tree.
    expect(header.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(board.compareDocumentPosition(keyboard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses the small-viewport height unit, not 100vh, so Safari’s address bar cannot push the keyboard off screen', () => {
    const { container } = render(<Shell header={null} board={null} keyboard={null} />);
    const root = container.firstElementChild as HTMLElement;
    // Asserted on the class list (not computed style — jsdom performs no
    // layout and cannot tell 100svh from 100vh at runtime) so a regression
    // to `h-screen`/`min-h-screen` (100vh) fails this test.
    expect(root.className).toContain('h-svh');
    expect(root.className).not.toMatch(/\bh-screen\b/);
  });
});
