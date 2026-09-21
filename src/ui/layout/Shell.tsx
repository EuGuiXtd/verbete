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
 *
 * Task 23: `main` itself no longer carries `justify-center`. A flex
 * container that both scrolls (`overflow-y-auto`) and centers its own
 * children (`justify-content: center`) has a well-known trap — when the
 * children end up taller than the container (exactly what Quarteto's four
 * 9-row boards do on a short phone), centering shifts the whole flex line
 * so its start bleeds above the scrollport, and `scrollTop` cannot go
 * negative to reach it: the top of the content becomes permanently
 * unreachable, not just initially scrolled-past. Solo and Dueto never hit
 * this (their content was always shorter than `main`), which is exactly
 * why nothing here caught it before Quarteto existed — jsdom cannot see it
 * either, since it performs no layout at all; this was only found by
 * rendering Quarteto in a real browser at 320px and trying to scroll to
 * the first board.
 *
 * The fix moves centering one level down, onto `.grid-anchor` below, with
 * `min-h-full` instead of a fixed height — plus `shrink-0`, which is the
 * part that actually matters and was missing from this fix's first draft.
 * Without it, a real browser does NOT do what the paragraph above hopes:
 * a flex item's automatic minimum size is normally its own CONTENT size
 * (so a plain `flex-shrink: 1` item can never be shrunk smaller than what
 * it holds) — but that automatic floor only applies while `min-height`
 * computes to `auto`. The moment `.grid-anchor` sets an EXPLICIT
 * `min-height` (`min-h-full`, i.e. 100%), that automatic content-based
 * floor is switched off, its own default `flex-shrink: 1` becomes free to
 * act, and `main` (whose own height is fixed by `flex-1` above it) shrinks
 * `.grid-anchor` down to exactly that 100% figure — smaller than four
 * Quarteto boards need — with `justify-center` then centering the
 * (invisibly compressed) content around that too-small box, spilling it
 * out both above `.grid-anchor`'s top AND above `main`'s own top edge.
 * `shrink-0` disables that shrink entirely: `.grid-anchor`'s height
 * becomes `max(its own content height, min-h-full)` — grows past
 * `min-h-full` to fit tall content with `justify-center` then having
 * nothing left to center (content starts flush at the top, reachable by
 * ordinary scrolling), and still fills `min-h-full` to center short
 * content exactly as before. This was found only by rendering Quarteto in
 * a real browser at 320px and measuring `getBoundingClientRect()` — jsdom
 * performs no layout and cannot see a flex-shrink miscalculation like this
 * one; the first draft of this fix (without `shrink-0`) looked correct by
 * inspection and passed every unit test.
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
        screen. No `items-center`/`justify-center` here any more — see this
        component's own doc comment for why that moved to `.grid-anchor`.
      */}
      <main className="relative flex flex-1 flex-col overflow-y-auto px-4 py-4">
        <div className="grid-anchor flex min-h-full w-full shrink-0 flex-col items-center justify-center">
          {board}
        </div>
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
