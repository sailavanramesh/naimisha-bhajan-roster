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
 */

/** The organisation's colours, taken from the supplied artwork. */
const OUTLINE = "#2E8B57"; // green rule used throughout the mark
const PETAL = "#9DB4DE"; // cornflower petal
const CIRCLE = "#F6D3E4"; // pale pink ground of the inner circle
const STAR = "#FBFACB"; // pale yellow shatkona

const PETAL_PATH =
  "M0,-54 C13,-45 21,-32 15,-20 C10,-11 -10,-11 -15,-20 C-21,-32 -13,-45 0,-54 Z";
const PETAL_ANGLES = [30, 90, 150, 210, 270, 330];

function Marks({ strokeWidth }: { strokeWidth: number }) {
  return (
    <g stroke={OUTLINE} strokeWidth={strokeWidth} strokeLinejoin="round">
      {PETAL_ANGLES.map((deg) => (
        <path key={deg} transform={`rotate(${deg})`} d={PETAL_PATH} fill={PETAL} />
      ))}
      <circle r="27" fill={CIRCLE} />
      {/* Shatkona — two interlocking triangles */}
      <path d="M0,-25 L21.65,12.5 L-21.65,12.5 Z" fill={STAR} />
      <path d="M0,25 L21.65,-12.5 L-21.65,-12.5 Z" fill={STAR} fillOpacity="0.75" />
    </g>
  );
}

/** Small mark, for the nav. Devanagari is unreadable at this size, so the
 *  bindu is a dot. */
export function Yantra({
  size = 24,
  className,
  title = "Naimiṣa Sai Centre",
}: {
  size?: number;
  className?: string;
  title?: string;
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
      <title>{title}</title>
      <Marks strokeWidth={3} />
      <circle r="3.4" fill={OUTLINE} />
    </svg>
  );
}

/** Full mark with ॐ, for the page header and anywhere with room. */
export function YantraFull({ size = 54, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-60 -60 120 120"
      role="img"
      aria-label="Naimiṣa Sai Centre"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Naimiṣa Sai Centre</title>
      <Marks strokeWidth={2.4} />
      <text
        x="0"
        y="1"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="24"
        fill={OUTLINE}
        style={{ fontFamily: "'Noto Serif Devanagari', 'Noto Sans Devanagari', serif" }}
      >
        ॐ
      </text>
    </svg>
  );
}
