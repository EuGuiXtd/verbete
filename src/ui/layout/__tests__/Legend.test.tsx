import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Legend } from '../Legend';
import { Tile } from '../../board/Tile';

afterEach(cleanup);

/**
 * Feedback round 1, item 1. The legend's entire value is that it says what
 * each block means, in this game's own language, using this game's own
 * blocks — so the two things worth pinning are exactly those: the words, and
 * the fact that the swatch is the SAME element a real tile is, not a
 * hand-drawn copy of it that can drift from the board it explains.
 *
 * A jsdom test cannot see colour (no layout, no cascade resolution of
 * `var(--ink)`), which is why the class-parity assertion below is the honest
 * form of "this swatch paints what the board paints": both sides are read
 * off real renders in the same run, and the comparison is structural.
 */
describe('Legend', () => {
  it('names all three scored states in Portuguese', () => {
    render(<Legend />);
    const list = screen.getByRole('list', { name: 'O que cada bloco quer dizer' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Alugar certo', 'Alugar errado', 'Anão existe']);
  });

  it('draws each swatch with the very classes the matching board tile carries', () => {
    render(<Legend />);
    const swatches = screen
      .getByRole('list', { name: 'O que cada bloco quer dizer' })
      .querySelectorAll('span[aria-hidden="true"]');
    expect(swatches).toHaveLength(3);

    // The reference: three real tiles, rendered by the board's own component.
    const { container } = render(
      <>
        <Tile letter="A" state="correct" />
        <Tile letter="A" state="present" />
        <Tile letter="A" state="absent" />
      </>,
    );
    const tiles = container.querySelectorAll('div');
    expect(tiles).toHaveLength(3);

    tiles.forEach((tile, index) => {
      const swatch = swatches[index]!;
      // Every class the real tile has, the swatch has too. The swatch adds
      // exactly one of its own (`legenda-sorte`, which only shrinks the box
      // — see index.css), so this is containment, not equality.
      for (const className of tile.className.split(' ')) {
        expect(swatch.classList.contains(className)).toBe(true);
      }
      expect(swatch.classList.contains('legenda-sorte')).toBe(true);
    });
  });

  it('keeps the swatches out of the accessibility tree — the labels carry the meaning', () => {
    render(<Legend />);
    const list = screen.getByRole('list', { name: 'O que cada bloco quer dizer' });
    for (const item of within(list).getAllByRole('listitem')) {
      const swatch = item.querySelector('span');
      expect(swatch?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('stacks in the dialog and runs inline on the game screen', () => {
    const { container: inline } = render(<Legend />);
    const { container: stacked } = render(<Legend stacked />);
    expect(inline.firstElementChild?.className).toContain('flex-wrap');
    expect(stacked.firstElementChild?.className).toContain('flex-col');
    expect(stacked.firstElementChild?.className).not.toContain('flex-wrap');
  });
});
