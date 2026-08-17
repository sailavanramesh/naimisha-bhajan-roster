import { prisma } from "@/lib/db";
import { can, getRole } from "@/lib/auth";
import { ONLY_ARCHIVED } from "@/lib/archive";
import { NoAccess } from "@/components/RequireRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ArchiveRow } from "./ArchiveRow";

export const dynamic = "force-dynamic";

/**
 * The archive — everything an editor has removed, and nothing else.
 *
 * The one page in the app that deliberately looks past `NOT_ARCHIVED`; every
 * other query filters these rows out, which is what "removed from all views"
 * means. See lib/archive.ts.
 *
 * OWNER ONLY. An editor removes a session; an owner decides whether it comes
 * back or goes. Sailavan asked for the archive as "a fallback in case some
 * accidental mistakes have been made", and the person who made the mistake
 * being able to empty the bin is not a fallback.
 */
export default async function ArchivePage() {
  const role = await getRole();
  if (!can(role, "manageArchive")) {
    return <NoAccess what="The archive" role={role} />;
  }

  const sessions = await prisma.session.findMany({
    where: ONLY_ARCHIVED,
    orderBy: [{ archivedAt: "desc" }],
    select: {
      id: true,
      date: true,
      topic: true,
      format: true,
      archivedAt: true,
      archivedBy: true,
      slots: { select: { confirmedPitch: true } },
      _count: { select: { programItems: true } },
    },
  });

  const day = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const when = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Melbourne",
  });

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Archive</h1>
        <p className="mt-1 max-w-2xl text-sm text-on-ground-muted">
          Sessions and programmes an editor has removed. They are out of every list, every
          calendar and every history, and nothing on them has been touched — putting one back
          restores it exactly as it was.
        </p>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing in here</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-on-surface-muted">
            Nothing has been removed. When somebody removes a session it lands here rather than
            disappearing, and waits for you.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {sessions.map((s) => (
            <ArchiveRow
              key={s.id}
              id={s.id}
              dateLabel={day.format(s.date)}
              kind={s.format === "program" ? "program" : "session"}
              topic={s.topic}
              rows={s.format === "program" ? s._count.programItems : s.slots.length}
              pitches={s.slots.filter((x) => x.confirmedPitch).length}
              // Melbourne, because that is where the person reading it is —
              // Session DATES are UTC-stored calendar days, but this is a real
              // timestamp of something somebody did.
              archivedAt={s.archivedAt ? when.format(s.archivedAt) : ""}
              archivedBy={s.archivedBy}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
