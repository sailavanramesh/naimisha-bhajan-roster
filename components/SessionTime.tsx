"use client";

import { useEffect, useState } from "react";
import { timeLabel } from "@/lib/sessionsOfDay";
import {
  CENTRE_TIME_ZONE,
  deviceTimeZone,
  sameZone,
  viewerTime,
  zoneLabel,
} from "@/lib/timezones";

/**
 * A session's start time, read correctly from wherever you are standing.
 *
 * Venue time leads, always. The group says "7pm" and means the hall's clock at
 * 7 — that is the fact the roster is built on, it is what gets said out loud,
 * and quietly rewriting it to the reader's own clock would make two people
 * looking at the same session read different times with nothing on screen
 * saying so. So the reader's time is an ADDITION, never a replacement.
 *
 * Three things are shown, and each only when it carries information:
 *
 *   - the time itself, always;
 *   - the venue's city, when the session is not on the centre's own clock,
 *     because then "7pm" alone no longer says which 7pm;
 *   - the reader's own time, when their clock genuinely differs from the
 *     venue's at that moment.
 *
 * That last test is `sameClock`, comparing OFFSETS rather than zone names.
 * Melbourne and Sydney are different zones that always agree, and Brisbane is a
 * different zone that agrees for half the year — a Sydney member should never
 * be shown "7pm · 7pm your time", which is noise pretending to be help.
 */
export function SessionTime({
  dateISO,
  startsAt,
  timeZone,
  className,
}: {
  /** The session's calendar date, `YYYY-MM-DD`. */
  dateISO: string;
  /** `"HH:MM"` on the venue's clock, or null for the usual evening. */
  startsAt: string | null | undefined;
  /** The venue's IANA zone. See Session.timeZone. */
  timeZone: string;
  className?: string;
}) {
  /*
   * The reader's time is filled in AFTER mount, never during render.
   *
   * The server has no device to ask, so anything derived from the reader's zone
   * would differ between the server's HTML and the browser's first render and
   * fail hydration — the same failure the en-AU comment in RosterCalendarClient
   * describes, arrived at from a different direction. Rendering nothing and
   * then adding it is the version that cannot mismatch.
   */
  const [yours, setYours] = useState<{ time: string; day: string | null } | null>(null);

  useEffect(() => {
    setYours(viewerTime(dateISO, startsAt, timeZone, deviceTimeZone(), timeLabel));
  }, [dateISO, startsAt, timeZone]);

  const venue = timeLabel(startsAt);
  if (!venue) return null;

  // Named only when it is not the centre's own clock — on a Melbourne session
  // read in Melbourne, which is nearly all of them, this adds nothing.
  const elsewhere = !sameZone(timeZone, CENTRE_TIME_ZONE);

  return (
    <span className={className}>
      {venue}
      {elsewhere ? (
        <span className="text-on-surface-muted"> {zoneLabel(timeZone)}</span>
      ) : null}
      {yours ? (
        <span className="text-on-surface-muted">
          {" · "}
          {yours.time} your time{yours.day ? ` (${yours.day})` : null}
        </span>
      ) : null}
    </span>
  );
}
