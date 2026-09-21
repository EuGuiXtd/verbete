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

  it('never centers `main` itself — only its inner min-h-full wrapper — so tall content (Quarteto) stays scrollable to its own top', () => {
    // jsdom performs no layout, so this cannot measure the actual overflow
    // bug (see Shell.tsx's own doc comment); it only pins down the DOM
    // shape the fix depends on, so a regression that moves justify-center
    // back onto `main` fails here instead of only in a real browser.
    render(
      <Shell
        header={null}
        board={<div data-testid="board">tabuleiros</div>}
        keyboard={null}
      />,
    );

    const main = document.querySelector('main');
    if (main === null) throw new Error('expected a <main> element');
    expect(main.className).not.toMatch(/\bjustify-center\b/);
    expect(main.className).not.toMatch(/\bitems-center\b/);

    const board = screen.getByTestId('board');
    const anchor = board.closest('.grid-anchor');
    if (anchor === null) throw new Error('expected board to be wrapped in .grid-anchor');
    expect(anchor.className).toMatch(/\bmin-h-full\b/);
    expect(anchor.className).toMatch(/\bjustify-center\b/);
    // The anchor must actually live inside `main` for `min-h-full` (100%
    // of `main`'s own height) to resolve against the right box.
    expect(main.contains(anchor)).toBe(true);
  });
});
