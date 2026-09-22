import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { KEY_ROWS } from '../../engine/keyboard';
import type { KeyState } from '../../engine/keyboard';
import { Key, vibrateOnTouch } from './Key';

export interface KeyboardProps {
  readonly states: ReadonlyMap<string, readonly KeyState[]>;
  readonly boardCount: number;
  readonly onKey: (letter: string) => void;
  readonly onEnter: () => void;
  readonly onBackspace: () => void;
}

interface ActionKeyProps {
  readonly label: string;
  readonly ariaLabel: string;
  readonly onPress: () => void;
}

/**
 * ENVIAR / apagar are action keys, not scored letters: they never carry a
 * per-board state and never split into bands. They still get the same
 * `.tecla` treatment, the same 44px height floor and the same
 * vibrate-on-touch guard as a letter key, via the shared `vibrateOnTouch`
 * from Key.tsx — one guard, not a second copy of it. Horizontal padding is
 * the one dimension that gives on the narrowest phones — see Key.tsx's
 * `SINGLE_STATE_CLASS` doc comment for the overflow this and the row gap
 * below are both part of fixing.
 */
function ActionKey({ label, ariaLabel, onPress }: ActionKeyProps) {
  return (
    <button
      type="button"
      className="tecla min-h-11 px-2 sm:px-4"
      aria-label={ariaLabel}
      onClick={onPress}
      onTouchStart={vibrateOnTouch}
    >
      {label}
    </button>
  );
}

/** Which side of a keyboard row currently has content scrolled out of view. */
type ScrollEdges = 'none' | 'start' | 'end' | 'both';

/**
 * One scrolling keyboard row, plus the affordance that says it scrolls.
 *
 * At 320px the three rows measure scrollWidth 476/428/458 against a
 * clientWidth of 304: row 1 shows Q–Y and the rest is simply off-screen,
 * with no fade, no shadow and no scrollbar Chromium chooses to paint. The
 * page itself deliberately does not overflow (Shell's `overflow-x-hidden`,
 * see Keyboard's own doc comment above), which is the right call — but it
 * also removes the last cue that anything is there. A player on an iPhone SE
 * saw six of ten keys and no hint that the other four existed.
 *
 * `data-edges` drives a `mask-image` fade in index.css. Measured rather than
 * assumed, per side, because a permanent fade would be a lie at every width
 * where the row fits: at 375px a Solo row does fit, and fading its first and
 * last key would suggest hidden content that is not there. `none` (the
 * initial value, and the value whenever nothing overflows) renders exactly
 * what shipped before.
 *
 * Listens rather than polls: `scroll` for the player moving the row, and a
 * ResizeObserver on both the scrollport AND its content for a viewport
 * change or a variant switch (Solo's 30px keys against Quarteto's 44px ones
 * change the content width without the scrollport itself resizing).
 * ResizeObserver is guarded because jsdom does not implement it; without
 * one the rows simply keep their initial `none`, which is the pre-existing
 * behaviour, not a crash.
 */
function KeyboardRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>('none');

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    // A sub-pixel slack: a scrollport's own width and its content's width
    // are fractional, so an exact comparison reports a permanent 0.3px of
    // "hidden" content on a row that fits perfectly.
    const SLACK = 1;
    const measure = () => {
      const atStart = element.scrollLeft <= SLACK;
      const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - SLACK;
      setEdges(atStart && atEnd ? 'none' : atStart ? 'end' : atEnd ? 'start' : 'both');
    };

    measure();
    element.addEventListener('scroll', measure, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(measure);
      observer.observe(element);
      const content = element.firstElementChild;
      if (content !== null) observer.observe(content);
    }

    return () => {
      element.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      data-edges={edges}
      className="fila-teclado flex w-full overflow-x-auto overscroll-x-contain"
    >
      {children}
    </div>
  );
}

/**
 * The only touch input path in the game. Maps KEY_ROWS (QWERTY, A–Z, no
 * cedilla, no accents) and appends a submit and a backspace key to the
 * last row. There is no `<input>` behind this — every letter the player
 * types arrives through `onKey`, exactly like a tap on this keyboard would.
 *
 * `overflow-x-auto` is a safety net for a row wider than the viewport, but
 * the row itself does NOT center that overflowing content with
 * `justify-content` — see the doc comment on the inner, `.mx-auto` wrapper
 * below for why, and Task 23's report for the measurements. Key.tsx's
 * narrower mobile floor keeps a SINGLE-key row's overflow small (Solo, one
 * board), but Task 23 found this row also has to carry a SEGMENTED key
 * row (Dueto/Quarteto), which is fixed at 44px with no narrower mobile
 * variant (see Key.tsx's `.tecla-multipla`) — at 320px that overflows by
 * far more than the single-key case ever did, and a naive
 * `justify-center` on the scrolling row itself made the overflow on the
 * LEFT permanently unreachable (`scrollLeft` cannot go negative), not just
 * present. `overscroll-x-contain` plus Shell's own `overflow-x-hidden`
 * (see Shell.tsx) keep any scrolling here from ever dragging the whole
 * page sideways.
 */
export function Keyboard({ states, boardCount, onKey, onEnter, onBackspace }: KeyboardProps) {
  const unusedForEveryBoard: readonly KeyState[] = Array.from({ length: boardCount }, () => 'unused');
  const lastRowIndex = KEY_ROWS.length - 1;

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-[6px]" role="group" aria-label="Teclado">
      {KEY_ROWS.map((row, rowIndex) => (
        // The scroller: no `justify-content` and no `align-items` of its
        // own. Centering a row's keys with `justify-content: center` here
        // (the previous version of this component) is the exact same trap
        // Shell.tsx's own doc comment describes for the vertical axis, just
        // horizontal: when the keys are wider than this row (Dueto/
        // Quarteto's segmented keys at 320px), centering shifts the whole
        // flex line so it starts to the LEFT of x=0 — and `scrollLeft`
        // cannot go negative to reach it. Measured directly: the very first
        // key ("Q") sat off-screen at every reachable scroll position, not
        // just the initial one — a real, fully unreachable key, not merely
        // an inconvenient one.
        // Task 25 fix round 1 (F3) first fixed a clipped `:focus-visible`
        // ring here with `p-1.5` padding on this scroll container. Fix
        // round 2 reverted that: padding every row cost 36px of keyboard
        // height, measured to push Solo's own sixth row — the one the
        // player types their final guess into — off screen at 360x800 and
        // 375x812, two of the most common phone sizes in Brazil. The actual
        // fix now lives in `.tecla`'s own `:focus-visible` rule in
        // index.css: an INSET ring (`outline-offset: -2px`) needs no room
        // outside the key's own box at all, so this row needs no padding
        // to make room for one. See that rule's own doc comment for the
        // rest (why outline rather than box-shadow, and the segmented-key
        // double-ring it links to).
        <KeyboardRow key={rowIndex}>
          {/*
            `shrink-0`: same reason as Shell.tsx's `.grid-anchor` — without
            it, this wrapper's default `flex-shrink: 1` would let the row
            (whose own width is fixed by the viewport) compress it below
            its own keys' combined width instead of overflowing them,
            visually squashing every key in the row. `mx-auto` is the part
            that actually centers: auto margins on a flex item absorb
            whatever POSITIVE free space exists (centering this row's keys
            exactly like `justify-center` did when they fit), and collapse
            to zero the moment content is wider than the row — which is
            what makes the overflowing case start flush at the row's own
            left edge, reachable by ordinary rightward scrolling, instead
            of spilling unreachably off both sides.
          */}
          <div className="mx-auto flex shrink-0 gap-1 sm:gap-[6px]">
            {row.map((letter) => (
              <Key key={letter} letter={letter} states={states.get(letter) ?? unusedForEveryBoard} onPress={onKey} />
            ))}
            {rowIndex === lastRowIndex && (
              <>
                <ActionKey label="enviar" ariaLabel="Enviar tentativa" onPress={onEnter} />
                <ActionKey label="apagar" ariaLabel="Apagar última letra" onPress={onBackspace} />
              </>
            )}
          </div>
        </KeyboardRow>
      ))}
    </div>
  );
}
