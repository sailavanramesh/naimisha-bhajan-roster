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
  const selected = parseISODate(sp.d) ?? parseISODate(toISODate(todayUTC))!;
  const month = parseMonth(sp.m) ?? new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1, 0, 0, 0));
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 0, 0, 0));
  const monthEndExclusive = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1, 0, 0, 0));

  const monthSessions = await prisma.session.findMany({
    where: { date: { gte: monthStart, lt: monthEndExclusive } },
    select: { id: true, date: true, _count: { select: { singers: true } } },
    orderBy: { date: "asc" },
  });

  const dayInfo: Record<string, { sessionId: string; entries: number; hasSession: boolean }> = {};
  for (const s of monthSessions) {
    const iso = toISODate(s.date);
    dayInfo[iso] = {
      sessionId: s.id,
      entries: s._count.singers ?? 0,
      hasSession: true,
    };
  }

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
                  ? "Tap a day to open the session (edit mode will create if missing)."
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
              canEdit={canEdit}
              initialMonth={monthKey(monthStart)}
              initialSelected={toISODate(selected)}
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
