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

  it('credits Newsreader for the typeface and links to the OFL 1.1 licence text', () => {
    render(<AboutModal isOpen onClose={() => {}} />);
    expect(screen.getAllByText(/newsreader/i).length).toBeGreaterThan(0);
    const oflLink = screen.getByRole('link', { name: /open font license/i });
    expect(oflLink.getAttribute('href')).toBe('https://scripts.sil.org/OFL');
  });

  it('links the licence texts this app actually ships, not only the upstream pages (I2/I3)', () => {
    // LGPLv3 section 4 (via GPLv3 section 4) and OFL condition 2 both
    // require the licence to be conveyed WITH the work. An external link to
    // gnu.org or sil.org conveys nothing, least of all to the installed
    // offline copy. These three hrefs are same-origin files in public/,
    // precached by the service worker — e2e/pwa-offline.spec.ts proves the
    // precache half; this proves the app points at them at all.
    render(<AboutModal isOpen onClose={() => {}} />);
    expect(screen.getByRole('link', { name: 'LGPL-3.0' }).getAttribute('href')).toBe('/licenses/LGPL-3.0.txt');
    expect(screen.getByRole('link', { name: 'GPL-3.0' }).getAttribute('href')).toBe('/licenses/GPL-3.0.txt');
    expect(screen.getByRole('link', { name: 'OFL.txt' }).getAttribute('href')).toBe('/fonts/OFL.txt');
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
