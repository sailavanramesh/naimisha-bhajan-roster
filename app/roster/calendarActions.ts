/**
 * The calendar's two calls to the server.
 *
 * `dayInfo` carries a LIST of sessions per day since 2026-08-12 — a day can
 * hold a morning and an evening one — and this passes it through unchanged
 * rather than flattening it, which is what it used to do.
 */
type DaySession = {
  id: string;
  startsAt: string | null;
  categoryId: string | null;
  categoryName: string | null;
  entries: number;
  rows?: { singer: string; bhajan: string | null; pitch: string | null }[];
};

export async function fetchMonthInfo(monthKey: string): Promise<{
  dayInfo: Record<string, { sessions: DaySession[] }>;
}> {
  const res = await fetch(`/roster/month?m=${encodeURIComponent(monthKey)}`, { cache: "no-store" });
  if (!res.ok) return { dayInfo: {} };

  const data = await res.json();
  const src = (data?.dayInfo || {}) as Record<string, { sessions?: DaySession[] }>;

  const dayInfo: Record<string, { sessions: DaySession[] }> = {};
  for (const [k, v] of Object.entries(src)) {
    dayInfo[k] = { sessions: Array.isArray(v.sessions) ? v.sessions : [] };
  }
  return { dayInfo };
}

/**
 * The session on a day, creating it if there is none.
 *
 * `another` forces a new one onto a day that already has sessions — the only
 * way a second session gets created.
 */
export async function createSessionForDate(
  dateISO: string,
  opts: { another?: boolean } = {},
): Promise<{ id: string }> {
  const res = await fetch(`/api/roster/ensure`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date: dateISO, another: opts.another === true }),
  });
  if (!res.ok) throw new Error("Failed to create session");

  const data = await res.json();
  const id = String(data?.sessionId || "");
  if (!id) throw new Error("No sessionId returned");
  return { id };
}
