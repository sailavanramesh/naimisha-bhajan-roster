import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

let cache: { at: number; items: { id: string; title: string }[] } | null = null;

async function getAllTitles() {
  const now = Date.now();
  if (cache && now - cache.at < 5 * 60 * 1000) return cache.items;

  const items = await prisma.bhajan.findMany({
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  cache = { at: now, items };
  return items;
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") ?? "").trim();
  const q = normalize(qRaw);

  if (!q) return NextResponse.json({ items: [] });

  const all = await getAllTitles();
  const tokens = q.split(" ").filter(Boolean);

  const scored = all
    .map((x) => {
      const t = normalize(x.title);
      // all tokens must appear somewhere (simple fuzzy containment)
      for (const tok of tokens) {
        if (!t.includes(tok)) return null;
      }

      const pos = t.indexOf(tokens[0] ?? "");
      const score =
        (pos === -1 ? 9999 : pos) + Math.max(0, t.length - q.length);

      return { ...x, score };
    })
    .filter(Boolean) as Array<{ id: string; title: string; score: number }>;

  scored.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));

  return NextResponse.json({
    items: scored.slice(0, 25).map(({ id, title }) => ({ id, title })),
  });
}
