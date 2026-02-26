// app/roster/calendarActions.ts
// Client-side helpers used by RosterCalendarClient.
// These call your existing API routes under /api/roster/*

export async function fetchMonthInfo(monthKey: string): Promise<{
  dayInfo: Record<string, { hasSession: boolean; entries: number; sessionId?: string }>;
}> {
  const res = await fetch(`/api/roster/month?month=${encodeURIComponent(monthKey)}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    return { dayInfo: {} };
  }

  const data = await res.json();

  // API returns { days: { [YYYY-MM-DD]: { sessionId, entries, hasSession } } }
  const days = (data?.days || {}) as Record<
    string,
    { sessionId: string; entries: number; hasSession: boolean }
  >;

  const dayInfo: Record<string, { hasSession: boolean; entries: number; sessionId?: string }> = {};
  for (const [k, v] of Object.entries(days)) {
    dayInfo[k] = {
      hasSession: !!v?.hasSession,
      entries: Number(v?.entries ?? 0),
      sessionId: v?.sessionId,
    };
  }

  return { dayInfo };
}

export async function createSessionForDate(dateISO: string): Promise<{ id: string }> {
  const res = await fetch(`/api/roster/ensure`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date: dateISO }),
  });

  if (!res.ok) {
    throw new Error(`Failed to ensure session for ${dateISO}`);
  }

  const data = await res.json();
  const sessionId = String(data?.sessionId || "");
  if (!sessionId) {
    throw new Error(`No sessionId returned for ${dateISO}`);
  }
  return { id: sessionId };
}