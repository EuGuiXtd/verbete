import type { ReactNode } from 'react';

export interface ShellProps {
  readonly header: ReactNode;
  readonly board: ReactNode;
  readonly keyboard: ReactNode;
}

/**
 * The one-screen column layout: header, a board area that grows and scrolls
 * if it must, keyboard pinned at the bottom. `h-svh` (100svh, the *small*
 * viewport height), never `h-screen`/`min-h-screen` (100vh) — Safari's
 * collapsing/expanding address bar makes 100vh taller than the viewport
 * actually visible at any given moment, which pushes the keyboard off the
 * bottom of the screen on exactly the device most people will play this on.
 */
export function Shell({ header, board, keyboard }: ShellProps) {
  return (
    // `overflow-x-hidden`: the keyboard's own row may scroll horizontally
    // on the narrowest phones (see Keyboard.tsx) — this stops that from
    // ever widening the page itself and dragging the header and board
    // sideways along with it.
    <div className="flex h-svh flex-col overflow-x-hidden bg-paper text-ink">
      {header}
      {/*
        `relative`: so a toast (rendered inside `board`, absolutely
        positioned against this element) floats within the board area only —
        never over the header above it or the keyboard below it, both of
        which have their own, viewport-size-dependent heights that a
        viewport-fixed toast position could not reliably clear on every
        screen.
      */}
      <main className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-4">
        {board}
      </main>
      <footer
        className="shrink-0 px-2 pt-2"
        // The safe-area inset (the home-indicator gutter on notched iPhones)
        // has no Tailwind utility; env() only works from a real style decl.
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {keyboard}
      </footer>
    </div>
  );
}
