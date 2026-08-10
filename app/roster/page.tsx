import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from "@/components/ui";
import RosterCalendarClient from "./RosterCalendarClient";
import { EnableEditForm } from "@/components/EnableEditForm";

export const dynamic = "force-dynamic";
function toISODateUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function toISODateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0));
  return isNaN(dt.getTime()) ? null : dt;
}

function parseMonth(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1, 0, 0, 0));
  return isNaN(dt.getTime()) ? null : dt;
}

function monthKey(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildDaySummary(
  slots: Array<{ singer: { name: string } | null; bhajanTitle: string | null }>
) {
  const parts = slots
    .slice(0, 3)
    .map((x) => `${x.singer?.name ?? "Unassigned"}${x.bhajanTitle ? ` — ${x.bhajanTitle}` : ""}`)
    .filter(Boolean);
  if (!parts.length) return null;
  const suffix = slots.length > 3 ? " …" : "";
  return parts.join(" · ") + suffix;
}

function addDaysUTC(d: Date, n: number) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    from?: string;
    to?: string;
    m?: string;
    d?: string;
  }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const canEdit = cookieStore.get("edit")?.value === "1";

  const view = sp.view === "list" ? "list" : "calendar";
  const q = (sp.q ?? "").trim();

  const todayUTC = new Date();
  const selected = parseISODate(sp.d) ?? parseISODate(toISODateUTC(todayUTC))!;
  const month = parseMonth(sp.m) ?? new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1, 0, 0, 0));
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 0, 0, 0));
  const monthEndExclusive = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1, 0, 0, 0));

  const monthSessions = await prisma.session.findMany({
    where: { date: { gte: monthStart, lt: monthEndExclusive } },
    select: {
      id: true,
      date: true,
      _count: { select: { slots: true } },
      slots: {
        select: { bhajanTitle: true, singer: { select: { name: true } } },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { date: "asc" },
  });

  const dayInfo: Record<string, { sessionId: string; entries: number; hasSession: boolean; summary?: string | null }> = {};
  for (const s of monthSessions) {
    const value = {
      sessionId: s.id,
      entries: s._count.slots ?? 0,
      hasSession: true,
      summary: buildDaySummary(s.slots),
    };

    const utcKey = toISODateUTC(s.date);
    const localKey = toISODateLocal(s.date);

    dayInfo[utcKey] = value;
    if (!dayInfo[localKey]) dayInfo[localKey] = value;
  }

  let listSessions:
    | Array<{
        id: string;
        date: Date;
        notes: string | null;
        slots: { singer: { name: string } | null; bhajanTitle: string | null }[];
      }>
    | null = null;

  if (view === "list") {
    const from = parseISODate(sp.from) ?? null;
    const to = parseISODate(sp.to) ?? null;

    listSessions = await prisma.session.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { notes: { contains: q } },
                { slots: { some: { singer: { name: { contains: q } } } } },
                { slots: { some: { bhajanTitle: { contains: q } } } },
              ],
            }
          : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lt: addDaysUTC(to, 1) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "desc" },
      take: 200,
      include: { slots: { include: { singer: true } } },
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Roster</CardTitle>
              <div className="mt-1 text-sm text-on-surface-muted">
                {view === "calendar"
                  ? "Tap a day to open the session (edit mode will create if missing)."
                  : "List view. Search + date range available."}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                className="rounded-[12px] border px-3 py-2 text-sm hover:bg-panel-hover"
                href={`/roster?view=${view === "calendar" ? "list" : "calendar"}`}
              >
                {view === "calendar" ? "List view" : "Calendar view"}
              </Link>
            </div>
          </div>

          {canEdit ? (
            <div className="rounded-[12px] border bg-green-50 px-3 py-2 text-sm">
              <span className="font-medium">Edit mode ON</span>
              <span className="text-on-surface-muted"> — this browser can edit.</span>
            </div>
          ) : (
            <div className="rounded-[12px] border bg-amber-50 px-3 py-2 text-sm grid gap-2">
              <div>
                <span className="font-medium">Read-only</span>
                <span className="text-on-surface-muted"> — enter your edit key here to enable editing in this browser.</span>
              </div>
              <EnableEditForm returnTo={`/roster?view=${view}`} />
            </div>
          )}
        </CardHeader>

        <CardContent className="grid gap-4">
          {view === "calendar" ? (
            <RosterCalendarClient
              canEdit={canEdit}
              initialMonth={monthKey(monthStart)}
              initialSelected={toISODateUTC(selected)}
              initialDayInfo={dayInfo}
            />
          ) : (
            <>
              <form className="grid gap-2 md:grid-cols-4">
                <Input name="q" defaultValue={q} placeholder="Search singer / bhajan / notes…" />
                <Input name="from" type="date" defaultValue={sp.from ?? ""} />
                <Input name="to" type="date" defaultValue={sp.to ?? ""} />
                <Button type="submit">Apply</Button>
                <input type="hidden" name="view" value="list" />
              </form>

              <div className="grid gap-2">
                {(listSessions ?? []).map((s) => (
                  /*
                    One slot per line, not a run-on sentence. The old version
                    joined every singer and bhajan with a middle dot, so a
                    Sunday of ten slots wrapped into an unreadable paragraph
                    and an empty session was an unexplained blank card.
                  */
                  <Link
                    key={s.id}
                    href={`/roster/${s.id}`}
                    className="group rounded-[12px] border border-rule-surface bg-panel p-3 transition-colors hover:border-brass/40 hover:bg-panel-hover"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-[15px]">
                        {new Date(s.date).toLocaleDateString("en-AU", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </span>
                      <span className="shrink-0 text-[11px] text-on-surface-muted">
                        {s.slots.length === 0
                          ? "nothing rostered"
                          : `${s.slots.length} slot${s.slots.length === 1 ? "" : "s"}`}
                      </span>
                    </div>

                    {s.slots.length > 0 ? (
                      <ul className="mt-2 grid gap-0.5">
                        {s.slots.slice(0, 5).map((x, i) => (
                          <li
                            key={i}
                            className="grid grid-cols-[7rem_1fr] items-baseline gap-2 text-[13px]"
                          >
                            <span className="truncate font-medium">
                              {x.singer?.name ?? "Unassigned"}
                            </span>
                            <span className="truncate text-on-surface-muted">
                              {x.bhajanTitle ?? "—"}
                            </span>
                          </li>
                        ))}
                        {s.slots.length > 5 ? (
                          <li className="mt-0.5 text-[11px] text-on-surface-muted">
                            + {s.slots.length - 5} more
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}