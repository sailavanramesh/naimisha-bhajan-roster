"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Input, Button } from "@/components/ui";
import { computeRecommendedPitch } from "@/lib/computeRecommendedPitch";
import { updateSessionSingerRow, deleteSessionSingerRow, addSessionSingerRow } from "./actions";

type Singer = { id: string; name: string };

type Row = {
  id: string;
  singerId: string | null;
  singerName: string;
  bhajanId: string | null;
  bhajanTitle: string;
  confirmedPitch: string;
  recommendedPitch: string;
  tabla: string;
  notes: string;
};

type Suggestions = {
  pitches: string[];
  pitchToTabla: Record<string, string>;
};

export function SessionSingersGrid(props: {
  canEdit: boolean;
  sessionId: string;
  singers: Singer[];
  initialRows: Row[];
  suggestions: Suggestions;
}) {
  const { canEdit, sessionId, singers, initialRows, suggestions } = props;
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [isPending, startTransition] = useTransition();

  // Pitch list for datalist
  const pitchListId = "pitch-list";

  // quick lookup singer by id
  const singerById = useMemo(() => {
    const m = new Map<string, Singer>();
    for (const s of singers) m.set(s.id, s);
    return m;
  }, [singers]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (!canEdit) return;

    startTransition(async () => {
      await updateSessionSingerRow(id, patch);
    });
  }

  async function onAddRow() {
    if (!canEdit) return;
    startTransition(async () => {
      const newRow = await addSessionSingerRow(sessionId);
      setRows((prev) => [...prev, newRow]);
    });
  }

  function onDeleteRow(id: string) {
    if (!canEdit) return;
    startTransition(async () => {
      await deleteSessionSingerRow(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    });
  }

  // Auto-calc recommended pitch & tabla whenever singer/bhajan/confirmed pitch changes
  useEffect(() => {
    if (!canEdit) return;

    let cancelled = false;
    const run = async () => {
      const next = rows.map((r) => {
        const computed = computeRecommendedPitch({
          singerName: r.singerName,
          bhajanTitle: r.bhajanTitle,
          confirmedPitch: r.confirmedPitch,
          suggestions,
        });

        return {
          ...r,
          recommendedPitch: computed.recommendedPitch,
          tabla: computed.tabla,
        };
      });

      if (cancelled) return;

      // Only write changes back + persist if actually changed
      const patches: Array<{ id: string; patch: Partial<Row> }> = [];
      for (let i = 0; i < rows.length; i++) {
        const before = rows[i];
        const after = next[i];
        const patch: Partial<Row> = {};
        if ((before.recommendedPitch ?? "") !== (after.recommendedPitch ?? "")) patch.recommendedPitch = after.recommendedPitch;
        if ((before.tabla ?? "") !== (after.tabla ?? "")) patch.tabla = after.tabla;
        if (Object.keys(patch).length) patches.push({ id: before.id, patch });
      }

      if (!patches.length) return;

      // Update local first
      setRows(next);

      // Persist in background
      startTransition(async () => {
        for (const p of patches) {
          await updateSessionSingerRow(p.id, p.patch);
        }
      });
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.singerId}|${r.bhajanTitle}|${r.confirmedPitch}`).join("::")]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Roster</div>
        {canEdit ? (
          <Button type="button" onClick={onAddRow} disabled={isPending}>
            Add row
          </Button>
        ) : null}
      </div>

      <datalist id={pitchListId}>
        {suggestions.pitches.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="min-w-[1220px] w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-xs text-slate-600">
              <th className="sticky left-0 z-50 bg-slate-50 px-3 py-2 text-left font-semibold w-[190px] shadow-[2px_0_0_rgba(15,23,42,0.08)]">
                Singer
              </th>
              <th className="sticky left-[190px] z-50 bg-slate-50 px-3 py-2 text-left font-semibold w-[170px] border-l shadow-[2px_0_0_rgba(15,23,42,0.08)]">
                Bhajan
              </th>
              <th className="px-3 py-2 text-left font-semibold w-[200px]">Confirmed Pitch</th>
              <th className="px-3 py-2 text-left font-semibold w-[200px]">Recommended Pitch</th>
              <th className="px-3 py-2 text-left font-semibold w-[120px]">Tabla</th>
              <th className="px-3 py-2 text-left font-semibold w-[250px]">Notes</th>
              {canEdit ? <th className="px-3 py-2 text-left font-semibold w-[90px]">Actions</th> : null}
            </tr>
          </thead>

          <tbody className="divide-y">
            {rows.map((r) => {
              const singer = r.singerId ? singerById.get(r.singerId) : undefined;
              const rp = r.recommendedPitch ?? "";
              const tabla = r.tabla ?? "";

              return (
                <tr key={r.id} className="align-top">
                  {/* Singer */}
                  <td className="sticky left-0 z-30 bg-white px-3 py-2 w-[190px] shadow-[2px_0_0_rgba(15,23,42,0.08)]">
                    {canEdit ? (
                      <select
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={r.singerId ?? ""}
                        onChange={(e) => {
                          const nextId = e.target.value || null;
                          const nextName = nextId ? singerById.get(nextId)?.name ?? "" : "";
                          updateRow(r.id, { singerId: nextId, singerName: nextName });
                        }}
                      >
                        <option value="">—</option>
                        {singers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-sm text-slate-900 truncate">{singer?.name || r.singerName || "—"}</div>
                    )}
                  </td>

                  {/* Bhajan */}
                  <td className="sticky left-[190px] z-20 bg-white px-3 py-2 w-[170px] border-l shadow-[2px_0_0_rgba(15,23,42,0.08)]">
                    {canEdit ? (
                      <div className="grid gap-1">
                        <Input
                          value={r.bhajanTitle ?? ""}
                          placeholder="Bhajan title…"
                          onChange={(e) => updateRow(r.id, { bhajanTitle: e.target.value })}
                        />
                        {r.bhajanId ? (
                          <Link href={`/bhajans/${r.bhajanId}`} className="text-xs text-indigo-700 underline">
                            View bhajan
                          </Link>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-900 whitespace-normal break-words leading-5">{r.bhajanTitle || "—"}</div>
                    )}
                  </td>

                  {/* Confirmed pitch */}
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <Input
                        list={pitchListId}
                        value={r.confirmedPitch ?? ""}
                        placeholder="Confirmed"
                        title={r.confirmedPitch ?? ""}
                        className="w-full min-w-[170px]"
                        onChange={(e) => updateRow(r.id, { confirmedPitch: e.target.value })}
                      />
                    ) : (
                      <div className="rounded-xl border bg-white px-3 py-2 text-sm whitespace-normal break-words leading-5">
                        {r.confirmedPitch || "—"}
                      </div>
                    )}
                  </td>

                  {/* Recommended pitch (locked) */}
                  <td className="px-3 py-2">
                    <div
                      className="rounded-xl border bg-slate-50 px-3 py-2 text-sm whitespace-normal break-words leading-5"
                      title={rp}
                    >
                      {rp || "—"}
                    </div>
                  </td>

                  {/* Tabla (locked) */}
                  <td className="px-3 py-2">
                    <div
                      className="rounded-xl border bg-slate-50 px-3 py-2 text-sm whitespace-normal break-words leading-5"
                      title={tabla}
                    >
                      {tabla || "—"}
                    </div>
                  </td>

                  {/* Notes */}
                  <td className="px-3 py-2">
                    <Input
                      value={r.notes ?? ""}
                      placeholder="Notes…"
                      disabled={!canEdit}
                      title={r.notes ?? ""}
                      onChange={(e) => updateRow(r.id, { notes: e.target.value })}
                      className="w-full"
                    />
                  </td>

                  {/* Actions */}
                  {canEdit ? (
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        onClick={() => onDeleteRow(r.id)}
                        disabled={isPending}
                      >
                        Delete
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isPending ? <div className="text-xs text-slate-500">Saving…</div> : null}
    </div>
  );
}
