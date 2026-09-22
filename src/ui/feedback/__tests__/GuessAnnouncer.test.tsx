import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GuessAnnouncer } from '../GuessAnnouncer';

afterEach(() => {
  cleanup();
});

describe('GuessAnnouncer', () => {
  it('renders a polite, atomic live region carrying the given text', () => {
    render(<GuessAnnouncer text="Linha 1: C correta, A ausente, S ausente, A ausente, L ausente." />);

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.textContent).toBe('Linha 1: C correta, A ausente, S ausente, A ausente, L ausente.');
  });

  it('is visually hidden — sr-only, not a visible toast', () => {
    render(<GuessAnnouncer text="Linha 1: ..." />);
    expect(screen.getByRole('status').className).toContain('sr-only');
  });

  it('renders an empty region before any guess has been announced, rather than omitting it', () => {
    // The region itself must exist from the very first render — a region
    // that only mounts once there is something to say would miss the
    // FIRST accepted guess of a session, since aria-live only announces a
    // CHANGE and a screen reader needs the region already present to pick
    // up that first change at all.
    render(<GuessAnnouncer text="" />);
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
