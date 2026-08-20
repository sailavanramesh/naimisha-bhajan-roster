"use client";

/**
 * Pick a bhajan to pitch.
 *
 * Search-as-you-type against the same endpoint the list form uses, then a
 * plain link per result — navigating rather than holding the chosen bhajan in
 * client state, so the finder itself stays a server component with the
 * singer's history already resolved.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui";

type Hit = { id: string; title: string };

export function BhajanPicker({ currentId }: { currentId: string | null }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  // Only the newest search may write the results: on a slow connection an
  // earlier request can land after a later one and put back stale hits.
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/bhajans/search?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { items?: Hit[] };
        if (mine === seq.current) setHits(data.items ?? []);
      } catch {
        if (mine === seq.current) setHits([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs text-on-surface-muted">
        Which bhajan?
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Start typing a title…"
          autoComplete="off"
        />
      </label>

      {searching && hits.length === 0 ? (
        <p className="text-[11px] text-on-surface-muted">Searching…</p>
      ) : null}

      {hits.length > 0 ? (
        <ul className="grid gap-1">
          {hits.slice(0, 8).map((h) => (
            <li key={h.id}>
              <Link
                href={`/find-my-pitch?bhajan=${h.id}`}
                className={
                  h.id === currentId
                    ? "block rounded-[10px] border border-brass/50 bg-field px-2 py-1.5 text-sm"
                    : "block rounded-[10px] border border-rule-surface px-2 py-1.5 text-sm hover:border-brass/50"
                }
              >
                {h.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {q.trim().length >= 2 && !searching && hits.length === 0 ? (
        <p className="text-[11px] text-on-surface-muted">Nothing matches that.</p>
      ) : null}
    </div>
  );
}
