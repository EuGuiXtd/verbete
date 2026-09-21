import type { Config } from 'tailwindcss';

/*
 * Every colour here resolves to a custom property from src/styles/tokens.css,
 * so the light/dark swap happens in one place and Tailwind never needs a
 * `dark:` variant for colour. The consequence is that Tailwind's slash-alpha
 * modifiers (`bg-ink/40`) do NOT work — a bare hex in a var can't be split
 * into channels. Where translucency is needed, use the shadow/highlight
 * channel tokens (`--shadow-rgb`, `--highlight-rgb`) instead.
 *
 * Class names must always be written out in full in components. The scanner
 * reads source as plain text, so anything built by interpolation
 * (`bg-${state}`) gets pruned from the build and looks correct only in dev.
 */
export default {
  content: ['./index.html', './showcase.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: 'var(--paper)',
          raised: 'var(--paper-raised)',
          recess: 'var(--paper-recess)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          red: 'var(--ink-red)',
        },
        knockout: 'var(--knockout)',
        ghost: 'var(--ghost)',
        rule: 'var(--rule)',
      },
      fontFamily: {
        serif: 'var(--font-serif)',
      },
      fontSize: {
        micro: ['var(--text-micro)', { lineHeight: '1.4' }],
        small: ['var(--text-small)', { lineHeight: '1.5' }],
        body: ['var(--text-body)', { lineHeight: '1.65' }],
        lead: ['var(--text-lead)', { lineHeight: '1.55' }],
        tile: ['var(--text-tile)', { lineHeight: '1' }],
        headword: ['var(--text-headword)', { lineHeight: '1.1' }],
        display: ['var(--text-display)', { lineHeight: '0.95' }],
      },
      borderRadius: {
        tile: 'var(--radius-tile)',
        key: 'var(--radius-key)',
        sheet: 'var(--radius-sheet)',
      },
      boxShadow: {
        /*
         * A block standing proud of the sheet. Light catches its top edge,
         * its own bottom edge goes dark, it sits on a hard shelf of its
         * own shadow (--press-depth tall), and the sheet beneath takes a short soft cast. The
         * hard shelf is what reads as thickness; the soft cast alone would
         * read as a floating SaaS card.
         */
        'press-out': [
          'inset 0 1px 0 rgb(var(--highlight-rgb) / 0.50)',
          'inset 0 -1px 0 rgb(var(--shadow-rgb) / 0.55)',
          '0 var(--press-depth) 0 rgb(var(--shadow-rgb) / 0.40)',
          '0 calc(var(--press-depth) + 3px) 7px -3px rgb(var(--shadow-rgb) / 0.45)',
        ].join(', '),
        /*
         * A slot below the surface: an empty house in the composing stick,
         * or the blind deboss left where a block was pressed but never
         * inked. Dark at the top lip, a lit edge at the bottom.
         */
        'press-in': [
          'inset 0 2px 3px -1px rgb(var(--shadow-rgb) / 0.42)',
          'inset 0 1px 0 rgb(var(--shadow-rgb) / 0.55)',
          'inset 0 0 0 1px rgb(var(--shadow-rgb) / 0.12)',
          'inset 0 -1px 0 rgb(var(--highlight-rgb) / 0.85)',
          '0 1px 0 rgb(var(--highlight-rgb) / 0.55)',
        ].join(', '),
        /*
         * The instant of contact: the block is level with the sheet and has
         * no shelf left. Pair with `translate-y` of --press-depth.
         */
        'press-flat': 'inset 0 1px 2px rgb(var(--shadow-rgb) / 0.45)',
      },
    },
  },
  plugins: [],
} satisfies Config;
