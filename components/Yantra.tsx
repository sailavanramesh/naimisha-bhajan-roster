/**
 * The centre's mark: a six-petalled lotus around a shatkona, ॐ श्रīः at the bindu.
 *
 * Redrawn as SVG rather than using the supplied JPEG so it stays crisp at 22px
 * and — the point of the exercise — has **no white box**. The background is
 * transparent, so the page's paper shows through and it sits on the theme
 * instead of on top of it.
 *
 * The mark's own colours are the organisation's and are NOT themed. They do not
 * come from the app palette and must not be swapped for brass or anything else.
 *
 * The dev variant is the one exception, and it exists for the opposite reason:
 * it must NOT read as the organisation's mark. Every hue is turned through
 * roughly 180 degrees at the same lightness, so the drawing is unmistakably
 * the same shape and unmistakably not the real thing — which is the whole job
 * of a mark on a test system.
 */

/** The organisation's colours, taken from the supplied artwork. */
const OUTLINE = "#2E8B57"; // green rule used throughout the mark
const PETAL = "#9DB4DE"; // cornflower petal
const CIRCLE = "#F6D3E4"; // pale pink ground of the inner circle
const STAR = "#FBFACB"; // pale yellow shatkona

/** The same drawing, every hue turned through 180°. Dev only. */
const DEV_OUTLINE = "#8B2E62";
const DEV_PETAL = "#DEC79D";
const DEV_CIRCLE = "#D3F6E5";
const DEV_STAR = "#CBCCFB";

export type MarkVariant = "brand" | "dev";

function palette(variant: MarkVariant) {
  return variant === "dev"
    ? { outline: DEV_OUTLINE, petal: DEV_PETAL, circle: DEV_CIRCLE, star: DEV_STAR }
    : { outline: OUTLINE, petal: PETAL, circle: CIRCLE, star: STAR };
}

const PETAL_PATH =
  "M0,-54 C13,-45 21,-32 15,-20 C10,-11 -10,-11 -15,-20 C-21,-32 -13,-45 0,-54 Z";
const PETAL_ANGLES = [30, 90, 150, 210, 270, 330];

function Marks({ strokeWidth, variant }: { strokeWidth: number; variant: MarkVariant }) {
  const c = palette(variant);
  return (
    <g stroke={c.outline} strokeWidth={strokeWidth} strokeLinejoin="round">
      {PETAL_ANGLES.map((deg) => (
        <path key={deg} transform={`rotate(${deg})`} d={PETAL_PATH} fill={c.petal} />
      ))}
      <circle r="27" fill={c.circle} />
      {/* Shatkona — two interlocking triangles */}
      <path d="M0,-25 L21.65,12.5 L-21.65,12.5 Z" fill={c.star} />
      <path d="M0,25 L21.65,-12.5 L-21.65,-12.5 Z" fill={c.star} fillOpacity="0.75" />
    </g>
  );
}

/** Small mark, for the nav. Devanagari is unreadable at this size, so the
 *  bindu is a dot. */
export function Yantra({
  size = 24,
  className,
  variant = "brand",
  title = "Naimiṣa Sai Centre",
}: {
  size?: number;
  className?: string;
  title?: string;
  variant?: MarkVariant;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-60 -60 120 120"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{variant === "dev" ? `${title} — dev` : title}</title>
      <Marks strokeWidth={3} variant={variant} />
      <circle r="3.4" fill={palette(variant).outline} />
    </svg>
  );
}

/** Full mark with ॐ, for the page header and anywhere with room. */
export function YantraFull({
  size = 54,
  className,
  variant = "brand",
}: {
  size?: number;
  className?: string;
  variant?: MarkVariant;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-60 -60 120 120"
      role="img"
      aria-label={variant === "dev" ? "Naimiṣa Sai Centre — dev" : "Naimiṣa Sai Centre"}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{variant === "dev" ? "Naimiṣa Sai Centre — dev" : "Naimiṣa Sai Centre"}</title>
      <Marks strokeWidth={2.4} variant={variant} />
      <text
        x="0"
        y="1"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="24"
        fill={palette(variant).outline}
        style={{ fontFamily: "'Noto Serif Devanagari', 'Noto Sans Devanagari', serif" }}
      >
        ॐ
      </text>
    </svg>
  );
}
