/**
 * A small line-art attribute for each deity — the emblem, not the figure.
 *
 * Sailavan's steer: "doesn't always have to be the deity itself. i.e. flute
 * krishna, vel or spear for muruga, trident for shiva or linga." So these are
 * attributes and implements, which is both more tasteful at 16px and avoids
 * depicting a form badly.
 *
 * Drawn as strokes on `currentColor`, so they take the surrounding text colour
 * and stay legible on paper or in print. Never kumkum — that is reserved for
 * pitch deviation.
 *
 * These are FIRST OPTIONS, meant to be reviewed. See /admin for the full set
 * side by side; swapping any one of them is a change to a single path here.
 */

export const DEITY_SYMBOLS: Record<string, { label: string; path: React.ReactNode }> = {
  // Modak, the sweet offered to Ganesha.
  Ganesha: {
    label: "modak",
    path: (
      <>
        <path d="M12 3.5c3.2 3.2 5.5 8.2 5.5 12.5h-11C6.5 11.7 8.8 6.7 12 3.5Z" />
        <path d="M5 16.5h14" />
      </>
    ),
  },
  // Bansuri, Krishna's flute.
  Krishna: {
    label: "flute",
    path: (
      <>
        <path d="M3.5 15.5 20 6" />
        <circle cx="8.2" cy="13" r=".9" fill="currentColor" stroke="none" />
        <circle cx="11.2" cy="11.3" r=".9" fill="currentColor" stroke="none" />
        <circle cx="14.2" cy="9.6" r=".9" fill="currentColor" stroke="none" />
      </>
    ),
  },
  // Trishula, Shiva's trident.
  Shiva: {
    label: "trishula",
    path: (
      <>
        <path d="M12 21V8" />
        <path d="M6.5 9.5V5l2.6 3.2M17.5 9.5V5l-2.6 3.2" />
        <path d="M12 8 12 3.5" />
        <path d="M6.5 9.5h11" />
      </>
    ),
  },
  // Bow and arrow, Rama's.
  Rama: {
    label: "bow",
    path: (
      <>
        <path d="M7 3.5c5 3 5 14 0 17" />
        <path d="M7 3.5 7 20.5" />
        <path d="M8.5 12H20M17 9l3 3-3 3" />
      </>
    ),
  },
  // Lotus, for the Devi.
  Devi: {
    label: "lotus",
    path: (
      <>
        <path d="M12 5c1.8 2.4 1.8 5.4 0 7.6-1.8-2.2-1.8-5.2 0-7.6Z" />
        <path d="M12 12.6c2.4-1.6 5-1.6 7 .2-2.2 1.9-4.9 2.1-7 .6Z" />
        <path d="M12 12.6c-2.4-1.6-5-1.6-7 .2 2.2 1.9 4.9 2.1 7 .6Z" />
        <path d="M4.5 16c3.5 3.4 11.5 3.4 15 0" />
      </>
    ),
  },
  // Jyoti, the flame.
  Sai: {
    label: "flame",
    path: (
      <>
        <path d="M12 3.2c3.4 3.6 5 6.3 5 9a5 5 0 0 1-10 0c0-2.7 1.6-5.4 5-9Z" />
        <path d="M12 17.4c-1.5-1-2.2-2.2-2.2-3.5 0-1.2.7-2.4 2.2-3.7 1.5 1.3 2.2 2.5 2.2 3.7 0 1.3-.7 2.5-2.2 3.5Z" />
      </>
    ),
  },
  // Padukas, the guru's sandals.
  Guru: {
    label: "padukas",
    path: (
      <>
        <path d="M6.5 4.5c1.9 0 2.8 1.4 2.8 4.2 0 3.4-.9 6.6-2.8 6.6s-2.8-3.2-2.8-6.6c0-2.8.9-4.2 2.8-4.2Z" />
        <path d="M17.5 8.7c1.9 0 2.8 1.4 2.8 4.2 0 3.4-.9 6.6-2.8 6.6s-2.8-3.2-2.8-6.6c0-2.8.9-4.2 2.8-4.2Z" />
        <circle cx="6.5" cy="3.2" r="1" />
        <circle cx="17.5" cy="7.4" r="1" />
      </>
    ),
  },
  // Shankha, Narayana's conch.
  Narayana: {
    label: "conch",
    path: (
      <>
        <path d="M15.5 3.5c2 2.6 2.6 6.4 1.4 9.6-1.3 3.5-4.3 6-7.9 6.6l-2.5.4 1.2-2.6c1.4-3 1.9-5.3 1.9-8 0-2.2.9-4.2 2.6-5.4a2.4 2.4 0 0 1 3.3-.6Z" />
        <path d="M12.4 7.5c.8 2 .7 4.4-.3 6.6" />
      </>
    ),
  },
  // Vel, Murugan's spear.
  Subrahmanya: {
    label: "vel",
    path: (
      <>
        <path d="M12 21V11" />
        <path d="M12 11c-2.6 0-4.2-1.6-4.2-4.2C7.8 4.6 9.6 3 12 3s4.2 1.6 4.2 3.8c0 2.6-1.6 4.2-4.2 4.2Z" />
        <path d="M12 3v8" />
      </>
    ),
  },
  // Gada, Hanuman's mace.
  Anjaneya: {
    label: "gada",
    path: (
      <>
        <path d="M11 21 16 16" />
        <circle cx="18" cy="14" r="3.4" />
        <path d="M9.4 19.4 12.6 22.6" stroke="none" />
      </>
    ),
  },
  // Dharma wheel.
  Buddha: {
    label: "dharmachakra",
    path: (
      <>
        <circle cx="12" cy="12" r="8.2" />
        <circle cx="12" cy="12" r="2.2" />
        <path d="M12 3.8v4M12 16.2v4M3.8 12h4M16.2 12h4M6.2 6.2l2.8 2.8M15 15l2.8 2.8M17.8 6.2 15 9M9 15l-2.8 2.8" />
      </>
    ),
  },
  Jesus: {
    label: "cross",
    path: (
      <>
        <path d="M12 3v18M6.5 8.5h11" />
      </>
    ),
  },
  Allah: {
    label: "crescent",
    path: <path d="M16.8 4.4a8.2 8.2 0 1 0 3.1 12.6A8.2 8.2 0 0 1 16.8 4.4Z" />,
  },
  Jehovah: {
    label: "star",
    path: (
      <>
        <path d="M12 3.4 20 17H4Z" />
        <path d="M12 20.6 4 7h16Z" />
      </>
    ),
  },
  // Sun.
  Surya: {
    label: "sun",
    path: (
      <>
        <circle cx="12" cy="12" r="4.4" />
        <path d="M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.4 5.4 7 7M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
      </>
    ),
  },
  // Oil lamp, for the Gayathri.
  Gayathri: {
    label: "lamp",
    path: (
      <>
        <path d="M4 14h16c0 3-3.4 5-8 5s-8-2-8-5Z" />
        <path d="M12 14c0-2.2 1.2-3.4 1.2-5 0-1.1-.6-2-1.2-2.6-.6.7-1.2 1.5-1.2 2.6 0 1.6 1.2 2.8 1.2 5Z" />
      </>
    ),
  },
  // Tulsi leaf, offered to Vittala.
  Vittala: {
    label: "tulsi",
    path: (
      <>
        <path d="M12 21c0-6 3-9.6 8-10.6-1 5.6-4 9-8 10.6Z" />
        <path d="M12 21c0-6-3-9.6-8-10.6 1 5.6 4 9 8 10.6Z" />
        <path d="M12 21v-8" />
      </>
    ),
  },
  // Pillar, from which Narasimha emerged.
  Narasimha: {
    label: "pillar",
    path: (
      <>
        <path d="M7 4h10M7 20h10" />
        <path d="M9 4v16M15 4v16" />
      </>
    ),
  },
  // Bell.
  Ayyappa: {
    label: "bell",
    path: (
      <>
        <path d="M6.5 16c0-5 1.8-8 5.5-8s5.5 3 5.5 8Z" />
        <path d="M5 16h14" />
        <path d="M12 19.5a1.6 1.6 0 0 0 1.6-1.6h-3.2A1.6 1.6 0 0 0 12 19.5Z" />
      </>
    ),
  },
  // Five faiths in one circle.
  "Sarva Dharma": {
    label: "sarva dharma",
    path: (
      <>
        <circle cx="12" cy="12" r="8.4" />
        <path d="M12 4.6v3.2M12 16.2v3.2M4.6 12h3.2M16.2 12h3.2" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
  },
};

/** Deities that share another's emblem. */
const ALIASES: Record<string, string> = {
  "Sathya Sai": "Sai",
  Ganapathi: "Ganesha",
  Muruga: "Subrahmanya",
  Hanuman: "Anjaneya",
  Vishnu: "Narayana",
  Durga: "Devi",
  Lakshmi: "Devi",
  Saraswathi: "Devi",
};

export function symbolFor(deity: string | null | undefined) {
  if (!deity) return null;
  const name = deity.trim();
  const key = ALIASES[name] ?? name;
  return DEITY_SYMBOLS[key] ?? null;
}

/**
 * The emblem for a bhajan's first deity. Renders nothing when there is no
 * match — "missing is not excluded", and a wrong emblem is worse than none.
 */
export function DeitySymbol({
  deity,
  size = 16,
  className,
}: {
  deity: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const sym = symbolFor(deity);
  if (!sym) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={`${deity} — ${sym.label}`}
      className={className}
    >
      <title>{`${deity} — ${sym.label}`}</title>
      {sym.path}
    </svg>
  );
}
