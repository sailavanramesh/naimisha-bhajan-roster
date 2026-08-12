import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { BulkMetaPanel, type BulkSession } from "./BulkMetaPanel";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Set what kind of session many sessions were, in one pass.
 *
 * Sailavan is backfilling the kind and topic for 214 sessions from records
 * kept outside the app. Doing that a session at a time is four clicks each —
 * open it, open the details panel, choose, save — which is the sort of thing
 * that simply does not get finished.
 *
 * Deliberately not a rostering tool. It touches the labels on a session and
 * nothing inside it, which is what lets it be a flat list of checkboxes.
 *
 * Default range is everything, because backfilling is the job: the filters are
 * for narrowing, not for protecting anybody from a long list.
 */
export default async function SessionDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; kind?: string }>;
}) {
  const role = await getRole();
  if (!can(role, "editSessionNotes")) {
    return <NoAccess what="Setting session details" role={role} />;
  }

  const sp = await searchParams;
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.from && ISO.test(sp.from) ? sp.from : null;
  const to = sp.to && ISO.test(sp.to) ? sp.to : null;

  const [rows, categories, placeRows] = await Promise.all([
    prisma.session.findMany({
      where: {
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
              },
            }
          : {}),
        ...(sp.kind === "none" ? { categoryId: null } : {}),
        ...(sp.kind && sp.kind !== "none" ? { categoryId: sp.kind } : {}),
      },
      orderBy: [{ date: "desc" }, { startsAt: "asc" }],
      select: {
        id: true,
        date: true,
        startsAt: true,
        topic: true,
        location: true,
        categoryId: true,
        category: { select: { name: true } },
        _count: { select: { slots: true } },
      },
    }),
    prisma.sessionCategory.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.session.findMany({
      where: { location: { not: null } },
      distinct: ["location"],
      select: { location: true },
      orderBy: { location: "asc" },
    }),
  ]);

  const places = placeRows.map((x) => x.location!).filter(Boolean);

  const sessions: BulkSession[] = rows.map((s) => {
    const dateISO = s.date.toISOString().slice(0, 10);
    return {
      id: s.id,
      dateISO,
      // getUTCDay on a DATE column is the Melbourne weekday: there is no
      // instant to shift.
      weekday: WEEKDAYS[s.date.getUTCDay()],
      startsAt: s.startsAt,
      categoryId: s.categoryId,
      categoryName: s.category?.name ?? null,
      topic: s.topic,
      location: s.location,
      entries: s._count.slots,
    };
  });

  const uncategorised = sessions.filter((s) => !s.categoryId).length;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Session details in bulk</CardTitle>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-muted">
            What kind of session each one was, when it started, and what it was about. Pick
            some, set a field, apply. Anything left as &ldquo;leave as is&rdquo; is not
            touched — setting the kind on thirty Sundays will not blank their topics.
          </p>
          <p className="mt-2 text-xs text-on-surface-muted">
            {sessions.length} session{sessions.length === 1 ? "" : "s"} listed
            {uncategorised > 0 ? ` · ${uncategorised} with no kind set` : " · all have a kind"}
            {" · "}
            <Link href="/roster" className="underline underline-offset-2">
              back to the roster
            </Link>
          </p>

          {/* Narrowing, not paging: the whole point is to work through a lot. */}
          <form className="mt-3 flex flex-wrap items-end gap-2 text-xs" action="/roster/details">
            <label className="grid gap-1 text-on-surface-muted">
              From
              <input
                type="date"
                name="from"
                defaultValue={from ?? ""}
                className="h-8 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
              />
            </label>
            <label className="grid gap-1 text-on-surface-muted">
              To
              <input
                type="date"
                name="to"
                defaultValue={to ?? ""}
                className="h-8 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
              />
            </label>
            <label className="grid gap-1 text-on-surface-muted">
              Kind
              <select
                name="kind"
                defaultValue={sp.kind ?? ""}
                className="h-8 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
              >
                <option value="">any</option>
                <option value="none">not set yet</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="h-8 rounded-[10px] border border-rule-surface bg-field px-3 hover:border-brass/50"
            >
              Filter
            </button>
          </form>
        </CardHeader>

        <CardContent>
          <BulkMetaPanel sessions={sessions} categories={categories} places={places} />
        </CardContent>
      </Card>
    </div>
  );
}
