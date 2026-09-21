import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tile } from '../Tile';

describe('Tile', () => {
  it('shows the letter', () => {
    render(<Tile letter="A" state="correct" />);
    expect(screen.getByText('A')).toBeDefined();
  });

  it('names its state for assistive technology', () => {
    render(<Tile letter="A" state="present" />);
    expect(screen.getByRole('img', { name: /A.*posição errada/i })).toBeDefined();
  });

  it('renders an empty tile without a label', () => {
    const { container } = render(<Tile letter="" state="empty" />);
    expect(container.textContent).toBe('');
  });
});
