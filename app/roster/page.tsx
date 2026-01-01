import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from "@/components/ui";
import { RosterCalendarClient } from "./RosterCalendarClient";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseISODate(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return isNaN(dt.getTime()) ? null : dt;
}

function parseMonth(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(`${m[1]}-${m[2]}-01T00:00:00.000Z`);
  return isNaN(dt.getTime()) ? null : dt;
}

function monthKey(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function addDaysUTC(d: Date, n: number) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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
  // ✅ Next 15: searchParams is async-typed in your setup
  const sp = await searchParams;

  // ✅ Next 15: cookies() is async-typed
  const cookieStore = await cookies();
  const canEdit = cookieStore.get("edit")?.value === "1";

  const view = sp.view === "list" ? "list" : "calendar";
  const q = (sp.q ?? "").trim();

  // Calendar params
  const todayUTC = new Date();
  const selected = parseISODate(sp.d) ?? parseISODate(toISODate(todayUTC))!;
  const month =
    parseMonth(sp.m) ?? new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1));
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const monthEndExclusive = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

  // Pull sessions for the visible month
  const monthSessions = await prisma.session.findMany({
    where: {
      date: { gte: monthStart, lt: monthEndExclusive },
    },
    select: {
      id: true,
      date: true,
      _count: { select: { singers: true } },
    },
    orderBy: { date: "asc" },
  });

  // Map day -> { sessionId, entries }
  const dayInfo: Record<string, { sessionId: string; entries: number }> = {};
  for (const s of monthSessions) {
    const iso = toISODate(s.date);
    const entries = s._count.singers ?? 0;
    // Store all sessions, but UI can decide whether to show a dot/badge
    dayInfo[iso] = { sessionId: s.id, entries };
  }

  // LIST VIEW
  let listSessions:
    | Array<{
        id: string;
        date: Date;
        notes: string | null;
        singers: { singer: { name: string }; bhajanTitle: string | null }[];
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
                { singers: { some: { singer: { name: { contains: q } } } } },
                { singers: { some: { bhajanTitle: { contains: q } } } },
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
      include: { singers: { include: { singer: true } } },
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Roster</CardTitle>
              <div className="mt-1 text-sm text-gray-600">
                {view === "calendar"
                  ? "Calendar view (default). Tap a day to see details."
                  : "List view. Search + date range available."}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                href={`/roster?view=${view === "calendar" ? "list" : "calendar"}`}
              >
                {view === "calendar" ? "List view" : "Calendar view"}
              </Link>
            </div>
          </div>

          {canEdit ? (
            <div className="rounded-2xl border bg-green-50 px-3 py-2 text-sm">
              <span className="font-medium">Edit mode ON</span>
              <span className="text-gray-700"> — this browser can edit.</span>
            </div>
          ) : (
            <div className="rounded-2xl border bg-amber-50 px-3 py-2 text-sm">
              <span className="font-medium">Read-only</span>
              <span className="text-gray-700"> — open your edit link to enable editing.</span>
            </div>
          )}
        </CardHeader>

        <CardContent className="grid gap-4">
          {view === "calendar" ? (
            <RosterCalendarClient
              initialMonth={monthKey(monthStart)}
              initialSelected={toISODate(selected)}
              dayInfo={dayInfo}
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
                  <Link
                    key={s.id}
                    href={`/roster/${s.id}`}
                    className="rounded-2xl border bg-white p-3 hover:bg-gray-50"
                  >
                    <div className="text-sm font-medium">
                      {new Date(s.date).toLocaleDateString(undefined, {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="mt-1 text-sm text-gray-700">
                      {s.singers
                        .slice(0, 8)
                        .map((x) => `${x.singer.name}${x.bhajanTitle ? ` — ${x.bhajanTitle}` : ""}`)
                        .join(" · ")}
                      {s.singers.length > 8 ? " …" : ""}
                    </div>
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
