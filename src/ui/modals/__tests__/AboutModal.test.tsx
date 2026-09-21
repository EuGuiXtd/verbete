import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AboutModal } from '../AboutModal';

afterEach(() => {
  cleanup();
});

describe('AboutModal', () => {
  it('renders nothing while closed', () => {
    render(<AboutModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('credits VERO for the word lists, by name', () => {
    render(<AboutModal isOpen onClose={() => {}} />);
    expect(screen.getAllByText(/vero/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/raimundo santos moura/i).length).toBeGreaterThan(0);
  });

  it('links to Wikcionário and to the CC BY-SA 4.0 licence text', () => {
    render(<AboutModal isOpen onClose={() => {}} />);
    const ccLink = screen.getByRole('link', { name: /cc by-sa 4\.0/i });
    expect(ccLink.getAttribute('href')).toBe('https://creativecommons.org/licenses/by-sa/4.0/');

    const wikiLink = screen.getByRole('link', { name: /wikcionário/i });
    expect(wikiLink.getAttribute('href')).toContain('wiktionary.org');
  });

  it('states the definitions were adapted — one sense selected, then shortened', () => {
    render(<AboutModal isOpen onClose={() => {}} />);
    expect(screen.getAllByText(/adaptad/i).length).toBeGreaterThan(0);
  });

  it('does not assert a specific MPL version for VERO, matching NOTICE.md\'s own unresolved-version stance', () => {
    render(<AboutModal isOpen onClose={() => {}} />);
    expect(screen.queryByText(/mpl-1\.1|mpl 1\.1|mozilla public license.*version 1/i)).toBeNull();
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<AboutModal isOpen onClose={() => { closed = true; }} />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(closed).toBe(true);
  });
});
