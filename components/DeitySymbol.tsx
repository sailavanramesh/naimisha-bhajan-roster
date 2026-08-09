import * as React from "react";

/**
 * A small coloured emblem for each deity.
 *
 * Second pass. The first was thin monochrome line-art and Sailavan could not
 * make the connection — correctly, because a modak and a plain diagonal line
 * are not iconic. These pick the attribute a person would actually recognise
 * (peacock feather for Krishna, vel for Murugan, chakra for Narayana) and give
 * each a colour.
 *
 * COLOUR NOTE. These are illustrative, not UI chrome, so they carry their own
 * hues rather than the five palette tokens — the same exception already made
 * for the organisation's logo. Two rules still hold:
 *   - Nothing here may be vermilion. `--kumkum` means pitch deviation and
 *     nothing else; a red emblem beside a pitch would muddy that instantly.
 *   - A deity with no emblem renders nothing. A wrong emblem is worse than
 *     none.
 */

/*
 * Palette, third pass — a balance between two references Sailavan liked.
 *
 * Drik Panchang's icons are FLAT FILLED illustrations in a warm saffron/gold
 * palette, sat in small round badges; they depict the deity's form. Mine were
 * thin line-art attributes in cool muted colours with no badge.
 *
 * The blend keeps the attribute (a flute reads at 22px; a figure does not, and
 * a badly drawn form is worse than none) but takes their warmth, their flat
 * fills and their badge. Hues are anchored on saffron and gold, with a few
 * accents only where an emblem needs to be told apart at a glance.
 *
 * SAFFRON IS NOT VERMILION. `--kumkum` (#A82E2E) means pitch deviation and
 * nothing else. These are orange and gold, deliberately kept clear of it.
 */
const SAFFRON = "#E08A2E";
const AMBER = "#C98A2E";
const GOLD = "#C39A3C";
const TEAL = "#2F7C7A";
const PEACOCK = "#1F6F8B";
const INDIGO = "#4A5A8C";
const GREEN = "#3E7D52";
const BROWN = "#8A6244";
const PLUM = "#7A5378";

type Emblem = { label: string; node: React.ReactNode };

export const DEITY_SYMBOLS: Record<string, Emblem> = {
  // Elephant head — the one thing everybody recognises instantly.
  Ganesha: {
    label: "Ganesha",
    node: (
      <g>
        <path
          d="M8.2 4.5c2.4-1.4 5.2-1.4 7.6 0 1.7 1 2.6 2.7 2.6 4.7 0 1.6-.5 2.9-1.4 4"
          stroke={BROWN}
          strokeWidth="1.6"
          fill="none"
        />
        <path
          d="M12 3.6c3.1 0 5.3 2.1 5.3 5.2 0 2.1-.7 3.6-2 4.9v3.1c0 .8-.6 1.4-1.4 1.4h-3.8c-.8 0-1.4-.6-1.4-1.4v-3.1c-1.3-1.3-2-2.8-2-4.9 0-3.1 2.2-5.2 5.3-5.2Z"
          fill={SAFFRON}
          fillOpacity="0.62"
          stroke={BROWN}
          strokeWidth="1.4"
        />
        {/* ears */}
        <path d="M6.7 7.4c-1.7-.3-2.9.7-2.9 2.3 0 1.7 1.3 2.9 3 2.7" fill={AMBER} fillOpacity="0.7" stroke={BROWN} strokeWidth="1.3" />
        <path d="M17.3 7.4c1.7-.3 2.9.7 2.9 2.3 0 1.7-1.3 2.9-3 2.7" fill={AMBER} fillOpacity="0.7" stroke={BROWN} strokeWidth="1.3" />
        {/* trunk */}
        <path d="M12 13.6v3.6c0 1.7 1.5 2.9 3 2.4" stroke={BROWN} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="10.1" cy="9.4" r=".9" fill={BROWN} />
        <circle cx="13.9" cy="9.4" r=".9" fill={BROWN} />
      </g>
    ),
  },

  // Peacock feather — Krishna's, and unmistakable.
  Krishna: {
    label: "Krishna",
    node: (
      <g>
        <path d="M12 21c0-4.5.4-7.6 1.2-10" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <ellipse cx="13.4" cy="8" rx="5" ry="6.4" fill={TEAL} fillOpacity="0.62" stroke={TEAL} strokeWidth="1.3" />
        <ellipse cx="13.4" cy="8.4" rx="2.6" ry="3.4" fill={PEACOCK} fillOpacity="0.65" stroke={PEACOCK} strokeWidth="1" />
        <ellipse cx="13.4" cy="8.6" rx="1.1" ry="1.6" fill={INDIGO} />
      </g>
    ),
  },

  // Trishula with the crescent moon.
  Shiva: {
    label: "Shiva",
    node: (
      <g stroke={INDIGO} strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M12 21V7" />
        <path d="M12 7.4c0-2.1.6-3.6 1.6-4.6" />
        <path d="M6.6 11V6.2c0-.5.6-.7.9-.3L10 9" />
        <path d="M17.4 11V6.2c0-.5-.6-.7-.9-.3L14 9" />
        <path d="M6.6 11h10.8" strokeWidth="1.4" />
        <path d="M9 16.6h6" strokeWidth="1.3" stroke={GOLD} />
      </g>
    ),
  },

  // Bow and arrow.
  Rama: {
    label: "Rama",
    node: (
      <g fill="none" strokeLinecap="round">
        <path d="M7.6 3.2c4.6 3.4 4.6 14.2 0 17.6" stroke={BROWN} strokeWidth="1.8" />
        <path d="M7.6 3.2 7.6 20.8" stroke={GOLD} strokeWidth="1.2" />
        <path d="M8.4 12H20" stroke={GOLD} strokeWidth="1.5" />
        <path d="M16.8 9.2 20 12l-3.2 2.8" stroke={GOLD} strokeWidth="1.5" />
      </g>
    ),
  },

  // Lotus.
  Devi: {
    label: "Devi",
    node: (
      <g stroke={PLUM} strokeWidth="1.3" strokeLinejoin="round">
        <path d="M12 4.2c1.9 2.7 1.9 6 0 8.6-1.9-2.6-1.9-5.9 0-8.6Z" fill={PLUM} fillOpacity="0.6" />
        <path d="M12 12.8c2.5-2.2 5.3-2.6 7.6-1-1.4 2.8-4.2 4.3-7.6 3.6Z" fill={PLUM} fillOpacity="0.7" />
        <path d="M12 12.8c-2.5-2.2-5.3-2.6-7.6-1 1.4 2.8 4.2 4.3 7.6 3.6Z" fill={PLUM} fillOpacity="0.7" />
        <path d="M4 16.4c3.9 3.4 12.1 3.4 16 0" stroke={PLUM} strokeWidth="1.5" fill="none" />
      </g>
    ),
  },

  // Jyoti — the lamp flame.
  Sai: {
    label: "Sai",
    node: (
      <g>
        <path
          d="M12 2.8c3.4 4 5 6.7 5 9.4a5 5 0 0 1-10 0c0-2.7 1.6-5.4 5-9.4Z"
          fill={SAFFRON}
          fillOpacity="0.68"
          stroke={AMBER}
          strokeWidth="1.4"
        />
        <path d="M12 16.8c-1.4-1-2-2-2-3.1 0-1.1.6-2.2 2-3.4 1.4 1.2 2 2.3 2 3.4 0 1.1-.6 2.1-2 3.1Z" fill={GOLD} />
        <path d="M6.5 20.4h11" stroke={BROWN} strokeWidth="1.6" strokeLinecap="round" />
      </g>
    ),
  },

  // Sudarshana chakra.
  Narayana: {
    label: "Narayana",
    node: (
      <g stroke={PEACOCK} strokeWidth="1.4">
        <circle cx="12" cy="12" r="8.2" fill={PEACOCK} fillOpacity="0.45" />
        <circle cx="12" cy="12" r="3" fill="none" />
        <path
          d="M12 3.8v3M12 17.2v3M3.8 12h3M17.2 12h3M6.2 6.2l2.1 2.1M15.7 15.7l2.1 2.1M17.8 6.2l-2.1 2.1M8.3 15.7l-2.1 2.1"
          strokeLinecap="round"
        />
      </g>
    ),
  },

  // Vel — Murugan's spear.
  Subrahmanya: {
    label: "Subrahmanya",
    node: (
      <g>
        <path d="M12 21.2V11.4" stroke={BROWN} strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M12 2.6c2.9 2.6 4.4 5.3 4.4 7.2 0 1.4-1.6 2.2-4.4 2.2s-4.4-.8-4.4-2.2c0-1.9 1.5-4.6 4.4-7.2Z"
          fill={GOLD}
          fillOpacity="0.7"
          stroke={GOLD}
          strokeWidth="1.4"
        />
        <path d="M12 3.6v8" stroke={GOLD} strokeWidth="1" />
      </g>
    ),
  },

  // Padukas — the guru's sandals.
  Guru: {
    label: "Guru",
    node: (
      <g stroke={BROWN} strokeWidth="1.3">
        <path d="M6.4 5.4c1.8 0 2.7 1.3 2.7 3.9 0 3.2-.9 6.2-2.7 6.2s-2.7-3-2.7-6.2c0-2.6.9-3.9 2.7-3.9Z" fill={BROWN} fillOpacity="0.7" />
        <path d="M17.6 8.5c1.8 0 2.7 1.3 2.7 3.9 0 3.2-.9 6.2-2.7 6.2s-2.7-3-2.7-6.2c0-2.6.9-3.9 2.7-3.9Z" fill={BROWN} fillOpacity="0.7" />
        <circle cx="6.4" cy="4" r="1.1" fill={GOLD} />
        <circle cx="17.6" cy="7.1" r="1.1" fill={GOLD} />
      </g>
    ),
  },

  // Gada — Hanuman's mace.
  Anjaneya: {
    label: "Anjaneya",
    node: (
      <g>
        <path d="M4.5 19.5 13 11" stroke={BROWN} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16.4" cy="7.6" r="4.2" fill={GOLD} fillOpacity="0.68" stroke={GOLD} strokeWidth="1.4" />
        <path d="M13.6 4.8 19.2 10.4" stroke={GOLD} strokeWidth="1.1" />
      </g>
    ),
  },

  Surya: {
    label: "Surya",
    node: (
      <g stroke={AMBER} strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.4" fill={AMBER} fillOpacity="0.68" />
        <path d="M12 2.4v2.6M12 19v2.6M2.4 12H5M19 12h2.6M5.2 5.2 7 7M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8" />
      </g>
    ),
  },

  Buddha: {
    label: "Buddha",
    node: (
      <g stroke={GOLD} strokeWidth="1.4">
        <circle cx="12" cy="12" r="8.2" fill={GOLD} fillOpacity="0.45" />
        <circle cx="12" cy="12" r="2.4" />
        <path d="M12 3.8v3.8M12 16.4v3.8M3.8 12h3.8M16.4 12h3.8M6.3 6.3l2.7 2.7M15 15l2.7 2.7M17.7 6.3 15 9M9 15l-2.7 2.7" />
      </g>
    ),
  },

  Jesus: {
    label: "Jesus",
    node: <path d="M12 3v18M6.5 8.5h11" stroke={INDIGO} strokeWidth="1.9" strokeLinecap="round" />,
  },

  Allah: {
    label: "Allah",
    node: (
      <g>
        <path d="M16.4 4.2a8.2 8.2 0 1 0 3.2 12.8A8.2 8.2 0 0 1 16.4 4.2Z" fill={GREEN} fillOpacity="0.6" stroke={GREEN} strokeWidth="1.4" />
      </g>
    ),
  },

  Jehovah: {
    label: "Jehovah",
    node: (
      <g stroke={INDIGO} strokeWidth="1.4" fill={INDIGO} fillOpacity="0.45">
        <path d="M12 3.4 20 17H4Z" />
        <path d="M12 20.6 4 7h16Z" />
      </g>
    ),
  },

  Gayathri: {
    label: "Gayathri",
    node: (
      <g>
        <path d="M4 14.2h16c0 3-3.4 5-8 5s-8-2-8-5Z" fill={BROWN} fillOpacity="0.55" stroke={BROWN} strokeWidth="1.4" />
        <path d="M12 14c0-2.3 1.3-3.5 1.3-5.2 0-1.2-.6-2.1-1.3-2.8-.7.7-1.3 1.6-1.3 2.8 0 1.7 1.3 2.9 1.3 5.2Z" fill={AMBER} stroke={AMBER} strokeWidth="1.1" />
      </g>
    ),
  },

  Vittala: {
    label: "Vittala",
    node: (
      <g stroke={GREEN} strokeWidth="1.3">
        <path d="M12 21c0-6 3-9.8 8-10.8-1 5.7-4 9.2-8 10.8Z" fill={GREEN} fillOpacity="0.55" />
        <path d="M12 21c0-6-3-9.8-8-10.8 1 5.7 4 9.2 8 10.8Z" fill={GREEN} fillOpacity="0.55" />
        <path d="M12 21v-8.4" strokeLinecap="round" />
      </g>
    ),
  },

  Narasimha: {
    label: "Narasimha",
    node: (
      <g stroke={AMBER} strokeWidth="1.5" strokeLinecap="round">
        <path d="M6.5 3.6h11M6.5 20.4h11" />
        <path d="M9 3.6v16.8M15 3.6v16.8" stroke={BROWN} />
      </g>
    ),
  },

  Ayyappa: {
    label: "Ayyappa",
    node: (
      <g stroke={GOLD} strokeWidth="1.4">
        <path d="M6.4 16.2c0-5.2 1.9-8.4 5.6-8.4s5.6 3.2 5.6 8.4Z" fill={GOLD} fillOpacity="0.6" />
        <path d="M4.8 16.2h14.4" strokeLinecap="round" />
        <path d="M12 19.8a1.7 1.7 0 0 0 1.7-1.7h-3.4a1.7 1.7 0 0 0 1.7 1.7Z" fill={GOLD} />
        <circle cx="12" cy="6.4" r="1.2" fill={GOLD} />
      </g>
    ),
  },

  "Sarva Dharma": {
    label: "Sarva Dharma",
    node: (
      <g>
        <circle cx="12" cy="12" r="8.4" fill={GOLD} fillOpacity="0.42" stroke={GOLD} strokeWidth="1.3" />
        <path d="M12 4.6v3" stroke={INDIGO} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 16.4v3" stroke={GREEN} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4.6 12h3" stroke={AMBER} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M16.4 12h3" stroke={TEAL} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="12" r="2.2" fill={GOLD} fillOpacity="0.7" stroke={GOLD} strokeWidth="1.1" />
      </g>
    ),
  },
};

/** Deities that share another's emblem. */
const ALIASES: Record<string, string> = {
  "Sathya Sai": "Sai",
  Ganapathi: "Ganesha",
  Muruga: "Subrahmanya",
  Murugan: "Subrahmanya",
  Hanuman: "Anjaneya",
  Vishnu: "Narayana",
  Durga: "Devi",
  Lakshmi: "Devi",
  Saraswathi: "Devi",
};

export function symbolFor(deity: string | null | undefined): Emblem | null {
  if (!deity) return null;
  const name = deity.trim();
  return DEITY_SYMBOLS[ALIASES[name] ?? name] ?? null;
}

export function DeitySymbol({
  deity,
  size = 22,
  className,
}: {
  deity: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const sym = symbolFor(deity);
  if (!sym) return null;
  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-brass/25 " +
        (className ?? "")
      }
      style={{
        width: size + 10,
        height: size + 10,
        // A warm tile behind the mark, as on the reference icons.
        background: "linear-gradient(160deg, rgb(var(--brass) / 0.16), rgb(var(--brass) / 0.05))",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        strokeLinejoin="round"
        role="img"
        aria-label={deity ?? undefined}
      >
        <title>{deity}</title>
        {sym.node}
      </svg>
    </span>
  );
}

/**
 * All of a bhajan's deities, as a row of badges.
 *
 * A bhajan may list several ("Sai, Krishna"), and showing only the first hid
 * that. Capped at three so a multi-deity bhajan cannot push the title off the
 * line; the count of any extras is stated rather than silently dropped.
 */
export function DeitySymbols({
  deities,
  size = 20,
  max = 3,
  className,
}: {
  deities: readonly string[];
  size?: number;
  max?: number;
  className?: string;
}) {
  const withEmblems = deities.filter((d) => symbolFor(d));
  if (withEmblems.length === 0) return null;
  const shown = withEmblems.slice(0, max);
  const hidden = withEmblems.length - shown.length;

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className ?? ""}`}>
      {shown.map((d) => (
        <DeitySymbol key={d} deity={d} size={size} />
      ))}
      {hidden > 0 ? (
        <span className="text-[10px] text-on-surface-muted" title={withEmblems.join(", ")}>
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
