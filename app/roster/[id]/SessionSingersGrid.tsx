"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Input, Button } from "@/components/ui";
import type { PitchSuggestionPayload } from "@/lib/pitchSuggestions";
import { computeRecommendedPitch } from "@/lib/computeRecommendedPitch";

type Singer = { id: string; name: string; gender?: string | null };

type Row = {
  id: string;
  singerId: string;
  singerName: string;
  bhajanId: string | null;
  bhajanTitle: string;
  confirmedPitch: string;
  recommendedPitch: string;
  tabla: string;
  notes: string;
};

export function SessionSingersGrid(props: {
  canEdit: boolean;
  sessionId: string;
  singers: Singer[];
  initialRows: Row[];
  suggestions: PitchSuggestionPayload;
}) {
  const [rows, setRows] = useState<Row[]>(props.initialRows);
  const [saving, startTransition] = useTransition();
  const saveTimer = useRef<number | null>(null);

  // Pitch list for datalist
  const pitchListId = "pitch-list";

  const singerById = useMemo(() => {
    const m = new Map<string, Singer>();
    for (const s of props.singers) m.set(s.id, s);
    return m;
  }, [props.singers]);

  function scheduleSave(nextRows: Row[]) {
    if (!props.canEdit) return;
    setRows(nextRows);

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      startTransition(async () => {
        await fetch("/api/roster/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: props.sessionId, rows: nextRows }),
        });
      });
    }, 400);
  }

  function updateRow(id: string, patch: Partial<Row>) {
    const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    scheduleSave(next);
  }

  function addRow() {
    if (!props.canEdit) return;
    const id = `new_${Math.random().toString(16).slice(2)}`;
    const next: Row[] = [
      ...rows,
      {
        id,
        singerId: "",
        singerName: "",
        bhajanId: null,
        bhajanTitle: "",
        confirmedPitch: "",
        recommendedPitch: "",
        tabla: "",
        notes: "",
      },
    ];
    scheduleSave(next);
  }

  function deleteRow(id: string) {
    if (!props.canEdit) return;
    const next = rows.filter((r) => r.id !== id);
    scheduleSave(next);
  }

  // Autocompute recommended pitch if missing
  useEffect(() => {
    if (!props.suggestions?.pitches?.length) return;

    let changed = false;
    const next = rows.map((r) => {
      const singer = r.singerId ? singerById.get(r.singerId) : undefined;
      const gender = singer?.gender ?? null;

      const recomputed = computeRecommendedPitch({
        pitches: props.suggestions.pitches,
        pitchToTabla: props.suggestions.pitchToTabla,
        singerGender: gender,
        bhajanTitle: r.bhajanTitle,
        confirmedPitch: r.confirmedPitch,
      });

      if (recomputed && recomputed !== r.recommendedPitch) {
        changed = true;
        return { ...r, recommendedPitch: recomputed };
      }
      return r;
    });

    if (changed) {
      // do NOT trigger save loop here; only update state locally
      setRows(next);
    }
  }, [rows, props.suggestions, singerById]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Roster</div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-600">{saving ? "Saving…" : "Saved"}</div>
          {props.canEdit ? (
            <Button type="button" onClick={addRow}>
              Add row
            </Button>
          ) : null}
        </div>
      </div>

      {/* Datalist for pitch suggestions */}
      <datalist id={pitchListId}>
        {props.suggestions.pitches.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="min-w-[1040px] w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b">
              {/* Sticky left columns */}
              <th className="sticky left-0 z-50 bg-slate-50 px-3 py-2 text-left font-semibold w-[190px]">Singer</th>
              <th className="sticky left-[190px] z-50 bg-slate-50 px-3 py-2 text-left font-semibold w-[220px] border-l">
                Bhajan
              </th>

              <th className="px-3 py-2 text-left font-semibold w-[220px]">Confirmed Pitch</th>
              <th className="px-3 py-2 text-left font-semibold w-[220px]">Recommended Pitch</th>
              <th className="px-3 py-2 text-left font-semibold w-[140px]">Tabla</th>
              <th className="px-3 py-2 text-left font-semibold w-[220px]">Notes</th>
              <th className="px-3 py-2 text-left font-semibold w-[90px]"> </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0 align-top">
                {/* Singer (sticky) */}
                <td className="sticky left-0 z-30 bg-white px-3 py-2 w-[190px]">
                  {props.canEdit ? (
                    <select
                      className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
                      value={r.singerId}
                      onChange={(e) => {
                        const singerId = e.target.value;
                        const singer = singerById.get(singerId);
                        updateRow(r.id, {
                          singerId,
                          singerName: singer?.name ?? "",
                        });
                      }}
                    >
                      <option value="">Select…</option>
                      {props.singers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm">{r.singerName || "—"}</div>
                  )}
                </td>

                {/* Bhajan (sticky) */}
                <td className="sticky left-[190px] z-20 bg-white px-3 py-2 w-[220px] border-l">
                  {props.canEdit ? (
                    <Input
                      value={r.bhajanTitle}
                      placeholder="Bhajan…"
                      onChange={(e) => updateRow(r.id, { bhajanTitle: e.target.value })}
                    />
                  ) : (
                    <div className="text-sm whitespace-normal break-words">{r.bhajanTitle || "—"}</div>
                  )}
                </td>

                {/* Confirmed pitch */}
                <td className="px-3 py-2">
                  <Input
                    list={pitchListId}
                    value={r.confirmedPitch ?? ""}
                    placeholder="Confirmed"
                    onChange={(e) => updateRow(r.id, { confirmedPitch: e.target.value })}
                    disabled={!props.canEdit}
                  />
                </td>

                {/* Recommended pitch (LOCKED – non-editable like Tabla) */}
                <td className="px-3 py-2">
                  <Input
                    list={pitchListId}
                    value={r.recommendedPitch ?? ""}
                    placeholder="Recommended"
                    disabled={true}
                  />
                </td>

                {/* Tabla */}
                <td className="px-3 py-2">
                  <Input value={r.tabla ?? ""} placeholder="Tabla" disabled={true} />
                </td>

                {/* Notes */}
                <td className="px-3 py-2">
                  {props.canEdit ? (
                    <Input value={r.notes ?? ""} placeholder="Notes…" onChange={(e) => updateRow(r.id, { notes: e.target.value })} />
                  ) : (
                    <div className="text-sm whitespace-normal break-words">{r.notes || "—"}</div>
                  )}
                </td>

                {/* Actions */}
                <td className="px-3 py-2 text-right">
                  {props.canEdit ? (
                    <Button type="button" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => deleteRow(r.id)}>
                      Delete
                    </Button>
                  ) : (
                    <Link className="text-xs underline underline-offset-2" href={`/singers/${r.singerId}`}>
                      Singer
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!props.canEdit ? (
        <div className="text-xs text-gray-600">
          Read-only mode: open your editable link to add/edit rows.
        </div>
      ) : null}
    </div>
  );
}
