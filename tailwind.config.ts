import type { Config } from "tailwindcss";

/**
 * The palette from docs/SPEC.md §6, exposed to Tailwind so components never
 * hand-mix colour. Values live as RGB triplets in app/globals.css.
 *
 * `kumkum` is reserved for pitch deviation. If you are reaching for it for a
 * button, a warning or an error, reach for `warn` or `brass` instead.
 */
const rgb = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: rgb("ink"),
        ivory: rgb("ivory"),
        brass: rgb("brass"),
        kumkum: rgb("kumkum"),
        muted: rgb("muted"),
        warn: rgb("warn"),
        "brass-ink": rgb("brass-ink"),
        panel: {
          DEFAULT: rgb("panel"),
          hover: rgb("panel-hover"),
        },
        field: rgb("field"),
        "card-edge": rgb("card-edge"),
        ground: {
          DEFAULT: rgb("ground"),
          raised: rgb("ground-raised"),
        },
        surface: {
          DEFAULT: rgb("surface"),
          sunk: rgb("surface-sunk"),
        },
        "on-ground": {
          DEFAULT: rgb("on-ground"),
          muted: rgb("on-ground-muted"),
        },
        "on-surface": {
          DEFAULT: rgb("on-surface"),
          muted: rgb("on-surface-muted"),
        },
        rule: {
          DEFAULT: rgb("rule"),
          surface: rgb("rule-on-surface"),
        },
      },
      fontFamily: {
        // Bhajan titles and page headers. Warm, slightly calligraphic serif
        // with the diacritic coverage transliterated Sanskrit needs.
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Pitch labels, counts, semitone deltas. Tabular figures.
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        key: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
