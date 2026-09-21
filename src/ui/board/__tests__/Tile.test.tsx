import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
import { Tile } from '../Tile';

afterEach(() => {
  cleanup();
});

describe('Tile', () => {
  it('shows the letter', () => {
    const { getByText } = render(<Tile letter="A" state="correct" />);
    expect(getByText('A')).toBeDefined();
  });

  it('names its state for assistive technology', () => {
    const { getByRole } = render(<Tile letter="A" state="present" />);
    expect(getByRole('img', { name: /A.*posição errada/i })).toBeDefined();
  });

  it('renders an empty tile without a label', () => {
    const { container } = render(<Tile letter="" state="empty" />);
    // Hidden from the accessibility tree entirely — not just textless. A
    // regression that gave the empty tile role="img" and an aria-label of
    // "undefined, na posição correta" would still pass a textContent-only
    // assertion; querying by role/name (scoped to this render's own
    // container, since this file has no per-test cleanup guarantee beyond
    // the afterEach above) is what actually catches it.
    expect(within(container).queryByRole('img')).toBeNull();
    const tile = container.firstElementChild;
    expect(tile?.getAttribute('aria-hidden')).toBe('true');
    expect(tile?.hasAttribute('aria-label')).toBe(false);
  });
});
