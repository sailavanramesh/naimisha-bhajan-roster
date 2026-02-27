export async function fetchMonthInfo(monthKey: string): Promise<{
  dayInfo: Record<string, { hasSession: boolean; entries: number; sessionId?: string }>;
}> {
  const res = await fetch(`/roster/month?m=${encodeURIComponent(monthKey)}`, { cache: "no-store" });
  if (!res.ok) return { dayInfo: {} };

  const data = await res.json();
  const src = (data?.dayInfo || {}) as Record<string, { sessionId: string; entries: number }>;

  const dayInfo: Record<string, { hasSession: boolean; entries: number; sessionId?: string }> = {};
  for (const [k, v] of Object.entries(src)) {
    dayInfo[k] = { hasSession: true, entries: Number(v.entries ?? 0), sessionId: v.sessionId };
  }
  return { dayInfo };
}

export async function createSessionForDate(dateISO: string): Promise<{ id: string }> {
  const res = await fetch(`/api/roster/ensure`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date: dateISO }),
  });
  if (!res.ok) throw new Error("Failed to create session");

  const data = await res.json();
  const id = String(data?.sessionId || "");
  if (!id) throw new Error("No sessionId returned");
  return { id };
}