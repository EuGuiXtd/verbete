/**
 * The handful of pictograms the chrome needs, drawn inline rather than
 * pulled from an icon set: four small paths are cheaper than a dependency,
 * and — more to the point — every one of them is drawn in `currentColor`,
 * so they inherit `.tecla`'s own ink and flip with the theme for free,
 * which a bitmap or a fixed-fill SVG sprite would not.
 *
 * All four share one 20-unit viewBox and one 18px rendered size, so they
 * optically match each other and the 14px `text-small` label they sit
 * beside. `aria-hidden` on every one of them without exception: each is
 * inside a button that already carries its own Portuguese `aria-label`
 * (see Header.tsx), so an exposed icon would only add a second, wordless
 * node for a screen reader to stop on.
 */

import type { ReactNode } from 'react';

const SIZE = 18;

function Frame({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/**
 * Three ascending bars. Replaces a literal "#" character (the owner's own
 * report: "o símbolo dele é um #"), which named neither of the two things
 * behind that button — the player's statistics and, through them, their
 * match history.
 */
export function EstatisticasIcon() {
  return (
    <Frame>
      <rect x="2.4" y="11.2" width="3.6" height="6.4" rx="0.8" />
      <rect x="8.2" y="6.6" width="3.6" height="11" rx="0.8" />
      <rect x="14" y="2.4" width="3.6" height="15.2" rx="0.8" />
    </Frame>
  );
}

/** Light theme: the shop under full daylight. */
export function SolIcon() {
  return (
    <Frame>
      <circle cx="10" cy="10" r="3.9" />
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M10 1.4v2.3M10 16.3v2.3M18.6 10h-2.3M3.7 10H1.4M16.1 3.9l-1.6 1.6M5.5 14.5l-1.6 1.6M16.1 16.1l-1.6-1.6M5.5 5.5 3.9 3.9" />
      </g>
    </Frame>
  );
}

/** Dark theme: the press bed under a low lamp. */
export function LuaIcon() {
  return (
    <Frame>
      <path d="M16.2 12.9A6.9 6.9 0 0 1 7.1 3.8a7.1 7.1 0 1 0 9.1 9.1z" />
    </Frame>
  );
}

/**
 * "Sistema": half the disc filled, half open — one shape saying "whichever
 * of the two the device is currently asking for", rather than a third,
 * unrelated pictogram.
 */
export function SistemaIcon() {
  return (
    <Frame>
      <circle cx="10" cy="10" r="6.7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 3.3a6.7 6.7 0 0 0 0 13.4z" />
    </Frame>
  );
}
