"use client";

/**
 * components/RecentlySungMark.tsx — "we sang this before", said in one place.
 *
 * One component for the three places a bhajan gets chosen: the roster grid, the
 * assign page, and the set /build proposes. They asked the same question three
 * different ways before this existed — /build had a chip in raw `amber-400`
 * that said "sung recently" with no date, no count and no way through to
 * anything, which is both off-theme and less than the grid's.
 *
 * ## It opens rather than navigates
 *
 * Sailavan, 2026-09-10: the first version linked out, "could that history
 * section of a bhajan potentially link to the session its referencing... any
 * other suggestions to make it a nice workflow". Leaving the page is the wrong
 * move in the middle of building a roster — the grid holds unsaved edits, and
 * the question being asked ("when did we sing this?") deserves an answer where
 * you already are. So the chip opens a small panel with the actual dates, each
 * one a way into that evening, and the bhajan's own page is a link at the foot
 * for when the answer is not enough.
 *
 * ## Two states
 *
 * LOUD when it was sung inside the window: ochre lead, firmer edge. QUIET when
 * it was sung, but longer ago than that: no lead, no colour, just the date.
 * The quiet state is the point — without it, four months ago looked exactly
 * like never, and the absence of a marker meant nothing at all. With it, a row
 * carrying nothing has genuinely never been sung here.
 */

import Link from "next/link";
import { AnchoredPopover, useAnchor } from "@/components/AnchoredPopover";
import {
  formatSessionDate,
  recentlySungParts,
  recentlySungTitle,
  wasSungRecently,
  type SungBefore,
} from "@/lib/recentlySung";

export function RecentlySungMark({
  bhajanId,
  sung,
  className,
}: {
  bhajanId: string;
  sung: SungBefore | null | undefined;
  /** Extra classes on the chip — spacing differs between the three callers. */
  className?: string;
}) {
  const pop = useAnchor<HTMLButtonElement>();

  if (!sung) return null;

  const recent = wasSungRecently(sung);
  const parts = recentlySungParts(sung);
  const title = recentlySungTitle(sung);

  /*
   * LOUD AND QUIET, AND WHY NEITHER IS A SIZE.
   *
   * Sailavan on the first version: "it blends in a bit too nicely now... but it
   * shouldn't become an eyesore just bcos it blends in." A bigger chip would
   * outrank the bhajan's own title, which is what the eye should land on first,
   * so the loud state spends its budget on ONE warm phrase — semibold `warn`
   * against a column of greys — plus a firmer edge and an arrow. The arrow
   * matters more than it looks: half of "it does not stand out" was that it did
   * not look like it went anywhere.
   *
   * `warn` and not `kumkum`: globals.css reserves kumkum for pitch deviation
   * and says so twice.
   */
  const chip = recent
    ? "border-warn/55 bg-warn/[0.12] hover:border-warn/80 hover:bg-warn/[0.2]"
    : "border-rule-surface bg-panel hover:border-rule-surface hover:bg-panel-hover";

  return (
    <>
      <button
        ref={pop.ref}
        type="button"
        onClick={pop.toggle}
        aria-expanded={pop.open}
        aria-haspopup="dialog"
        title={title}
        className={`group/sung flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-left text-[11px] transition-colors ${chip} ${className ?? ""}`}
      >
        <span aria-hidden className={recent ? "text-warn" : "text-on-surface-muted"}>
          ♪
        </span>
        <span className="whitespace-normal break-words">
          {parts.lead ? <span className="font-semibold text-warn">{parts.lead}</span> : null}
          <span className="text-on-surface-muted">
            {parts.lead ? " · " : ""}
            {parts.when}
            {parts.times ? ` · ${parts.times}` : ""}
          </span>
        </span>
        <span
          aria-hidden
          className={recent ? "text-warn/70 group-hover/sung:text-warn" : "text-on-surface-muted"}
        >
          {pop.open ? "▴" : "▾"}
        </span>
        <span className="sr-only">— {title}</span>
      </button>

      <AnchoredPopover
        open={pop.open}
        anchor={pop.rect}
        onClose={pop.close}
        label={title}
        box={{ preferredWidth: 288, maxHeight: 300 }}
        className="p-2 text-[12px]"
      >
        <p className="px-1 pb-1 text-[11px] font-semibold text-on-surface">
          {recent ? "Sung recently" : "Last sung"}
        </p>

        <ul className="grid gap-0.5">
          {sung.occurrences.map((o, i) => (
            <li
              key={`${o.sessionId}-${o.singerName ?? ""}-${i}`}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 rounded-[8px] px-1 py-1 odd:bg-surface/60"
            >
              {/* The date is the way into that evening — same rule as the
                  bhajan page's history table. */}
              <Link
                href={`/roster/${o.sessionId}`}
                className="whitespace-nowrap font-mono text-[11px] text-brass-ink underline decoration-dotted underline-offset-2 hover:decoration-solid"
              >
                {formatSessionDate(o.dateISO, { year: false })}
              </Link>
              <span className="min-w-0 text-on-surface-muted">
                {o.singerName ?? "unassigned"}
                {o.confirmedPitch ? ` · ${o.confirmedPitch}` : ""}
              </span>
            </li>
          ))}
        </ul>

        {sung.more > 0 ? (
          <p className="px-1 pt-1 text-[11px] text-on-surface-muted">
            and {sung.more} more before that
          </p>
        ) : null}

        <Link
          href={`/bhajans/${bhajanId}#sung`}
          className="mt-1.5 block rounded-[8px] px-1 py-1 text-[11px] text-brass-ink underline underline-offset-2 hover:bg-panel-hover"
        >
          Open the bhajan&rsquo;s full history →
        </Link>
      </AnchoredPopover>
    </>
  );
}
