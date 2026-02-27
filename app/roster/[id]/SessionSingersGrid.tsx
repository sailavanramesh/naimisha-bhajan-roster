"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { deleteSingerRow, upsertSessionSingerRows, type SingerRowInput } from "./actions";

type SingerLite = { id: string; name: string; gender: string | null };

type RowState = SingerRowInput & {
  _localId: string;
  singerName?: string;
  singerGender?: string | null;
  _pitchOpen?: boolean;
};

function matchPitches(all: string[], q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return all.slice(0, 8);
  return all.filter((p) => p.toLowerCase().includes(needle)).slice(0, 8);
}

export function SessionSingersGrid(props: {
  canEdit: boolean;
  sessionId: string;
  singers: SingerLite[];
  initialRows: Array<{
    id: string;
    singerId: string;
    singerName: string;
    singerGender: string | null;
    bhajanId: string | null;
    bhajanTitle: string | null;
    festivalBhajanTitle: string | null;
    confirmedPitch: string | null;
    alternativeTablaPitch: string | null;
    recommendedPitch: string | null;
    raga: string | null;
  }>;
  suggestions: {
    pitches: string[];
    pitchToTabla: Record<string, string>;
  };
}) {
  const [isPending, startTransition] = useTransition();

  const singerById = useMemo(() => new Map(props.singers.map((s) => [s.id, s])), [props.singers]);

  const [rows, setRows] = useState<RowState[]>(
    props.initialRows.map((r) => ({
      _localId: r.id,
      id: r.id,
      singerId: r.singerId,
      singerName: r.singerName,
      singerGender: r.singerGender,
      bhajanId: r.bhajanId,
      bhajanTitle: r.bhajanTitle,
      festivalBhajanTitle: r.festivalBhajanTitle,
      confirmedPitch: r.confirmedPitch,
      alternativeTablaPitch: r.alternativeTablaPitch,
      recommendedPitch: r.recommendedPitch,
      raga: r.raga,
      _pitchOpen: false,
    }))
  );

  function addRow() {
    if (!props.canEdit) return;
    const firstSinger = props.singers[0];
    const id = `new_${Math.random().toString(36).slice(2)}`;

    setRows((prev) => [
      ...prev,
      {
        _localId: id,
        id,
        singerId: firstSinger?.id || "",
        singerName: firstSinger?.name,
        singerGender: firstSinger?.gender ?? null,
        bhajanId: null,
        bhajanTitle: null,
        festivalBhajanTitle: null,
        confirmedPitch: null,
        alternativeTablaPitch: null,
        recommendedPitch: null,
        raga: null,
        _pitchOpen: false,
      },
    ]);
  }

  function updateRow(localId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, ...patch } : r)));
  }

  function onSingerChange(localId: string, singerId: string) {
    const s = singerById.get(singerId);
    updateRow(localId, {
      singerId,
      singerName: s?.name,
      singerGender: s?.gender ?? null,
    });
  }

  function onConfirmedPitchChange(localId: string, confirmed: string) {
    const tabla = confirmed ? (props.suggestions.pitchToTabla[confirmed] ?? "") : "";
    setRows((prev) =>
      prev.map((r) => {
        if (r._localId !== localId) return r;
        return {
          ...r,
          confirmedPitch: confirmed || null,
          alternativeTablaPitch: confirmed ? (tabla || null) : null,
        };
      })
    );
  }

  function saveAll() {
    if (!props.canEdit) return;
    startTransition(async () => {
      const payload: SingerRowInput[] = rows.map((r) => ({
        id: r.id,
        singerId: r.singerId,
        bhajanId: r.bhajanId,
        bhajanTitle: r.bhajanTitle,
        festivalBhajanTitle: r.festivalBhajanTitle,
        confirmedPitch: r.confirmedPitch,
        alternativeTablaPitch: r.alternativeTablaPitch,
        recommendedPitch: r.recommendedPitch,
        raga: r.raga,
      }));
      await upsertSessionSingerRows(props.sessionId, payload);
    });
  }

  function removeRow(localId: string) {
    const row = rows.find((r) => r._localId === localId);
    if (!row || !props.canEdit) return;

    startTransition(async () => {
      if (row.id && !String(row.id).startsWith("new_")) {
        await deleteSingerRow(row.id);
      }
      setRows((prev) => prev.filter((r) => r._localId !== localId));
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Roster entries</div>
        {props.canEdit ? (
          <div className="flex items-center gap-2">
            <Button onClick={addRow}>Add row</Button>
            <Button onClick={saveAll} className="bg-black text-white hover:bg-black/90">
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b">
              <th className="sticky left-0 z-50 bg-slate-50 px-3 py-2 text-left font-semibold w-[190px] border-r shadow-sm">
                Singer
              </th>
              <th className="sticky left-[190px] z-40 bg-slate-50 px-3 py-2 text-left font-semibold w-[200px] border-r shadow-sm">
                Bhajan
              </th>
              <th className="px-3 py-2 text-left font-semibold min-w-[240px]">Confirmed Pitch</th>
              <th className="px-3 py-2 text-left font-semibold min-w-[240px]">Recommended Pitch</th>
              <th className="px-3 py-2 text-left font-semibold w-[160px]">Tabla</th>
              {props.canEdit ? <th className="px-3 py-2 text-right font-semibold w-[110px]"> </th> : null}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const matches = matchPitches(props.suggestions.pitches, r.confirmedPitch ?? "");

              return (
                <tr key={r._localId} className="border-b align-top">
                  <td className="sticky left-0 z-30 bg-white px-3 py-2 w-[190px] border-r shadow-sm">
                    {props.canEdit ? (
                      <select
                        value={r.singerId}
                        onChange={(e) => onSingerChange(r._localId, e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                      >
                        {props.singers.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-sm font-medium">{r.singerName ?? "—"}</div>
                    )}
                    <div className="mt-1 text-xs text-gray-600">{r.singerGender ? r.singerGender : "—"}</div>
                  </td>

                  <td className="sticky left-[190px] z-20 bg-white px-3 py-2 w-[200px] border-r shadow-sm">
                    <div className="whitespace-normal break-words leading-5">
                      {r.bhajanTitle ?? r.festivalBhajanTitle ?? "—"}
                    </div>
                  </td>

                  <td className="px-3 py-2">
                    {props.canEdit ? (
                      <div className="relative">
                        <textarea
                          value={r.confirmedPitch ?? ""}
                          placeholder="Confirmed"
                          onChange={(e) => onConfirmedPitchChange(r._localId, e.target.value)}
                          onFocus={() => updateRow(r._localId, { _pitchOpen: true })}
                          onBlur={() => setTimeout(() => updateRow(r._localId, { _pitchOpen: false }), 120)}
                          className="w-full rounded-xl border px-3 py-2 text-sm leading-5 whitespace-pre-wrap resize-y min-h-[44px]"
                          rows={2}
                        />

                        {r._pitchOpen && matches.length > 0 ? (
                          <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow max-h-56 overflow-auto">
                            {matches.map((p) => (
                              <button
                                key={p}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => onConfirmedPitchChange(r._localId, p)}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-white px-3 py-2 whitespace-normal break-words leading-5">
                        {r.confirmedPitch ?? "—"}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2">
                    <div className="rounded-xl border bg-slate-50 px-3 py-2 whitespace-normal break-words leading-5">
                      {r.recommendedPitch ?? "—"}
                    </div>
                  </td>

                  <td className="px-3 py-2">
                    <div className="rounded-xl border bg-slate-50 px-3 py-2 whitespace-normal break-words leading-5">
                      {r.confirmedPitch ? (r.alternativeTablaPitch ?? "—") : "—"}
                    </div>
                  </td>

                  {props.canEdit ? (
                    <td className="px-3 py-2 text-right">
                      <Button onClick={() => removeRow(r._localId)} className="border-red-300 text-red-700 hover:bg-red-50">
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

      {!props.canEdit ? (
        <div className="text-xs text-gray-600">Read-only mode: open your edit link to add/edit rows.</div>
      ) : null}
    </div>
  );
}