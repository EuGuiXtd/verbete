import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HelpModal } from '../HelpModal';

afterEach(() => {
  cleanup();
});

describe('HelpModal', () => {
  it('renders nothing while closed', () => {
    render(<HelpModal isOpen={false} onClose={() => {}} onOpenAbout={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('explains that accents are filled in automatically and never count as a hint', () => {
    render(<HelpModal isOpen onClose={() => {}} onOpenAbout={() => {}} />);
    // `getAllBy*` rather than `getBy*`: the phrase spans a <strong> nested
    // inside its parent <p>, so both nodes' aggregated text legitimately
    // matches — this only needs to prove the phrase exists somewhere.
    expect(screen.getAllByText(/acento/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/nunca conta como dica/i).length).toBeGreaterThan(0);
  });

  it('explains that there is no Ç key', () => {
    render(<HelpModal isOpen onClose={() => {}} onOpenAbout={() => {}} />);
    expect(screen.getByText(/não há.*ç|sem.*ç|nenhuma tecla.*ç/i)).toBeDefined();
  });

  it('opens About from its own link', () => {
    let opened = false;
    render(<HelpModal isOpen onClose={() => {}} onOpenAbout={() => { opened = true; }} />);
    fireEvent.click(screen.getByRole('button', { name: /fontes|sobre/i }));
    expect(opened).toBe(true);
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<HelpModal isOpen onClose={() => { closed = true; }} onOpenAbout={() => {}} />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(closed).toBe(true);
  });

  // Task 25: proves the trap is actually WIRED into this real dialog, not
  // just correct in isolation (see useFocusTrap.test.tsx for the hook's own
  // exhaustive behaviour). A trigger button living outside the dialog, just
  // like Header.tsx's real "Ajuda" button does relative to this modal.
  it('traps Tab inside the dialog, away from a trigger button sitting outside it', () => {
    render(
      <>
        <button type="button">Ajuda</button>
        <HelpModal isOpen onClose={() => {}} onOpenAbout={() => {}} />
      </>,
    );
    screen.getByRole('button', { name: 'Ajuda' }).focus();
    expect(document.activeElement?.textContent).toBe('Ajuda');

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });

    // Redirected straight into the dialog's own first focusable control —
    // not left to fall through to whatever sits next to "Ajuda" in the DOM.
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });
});
