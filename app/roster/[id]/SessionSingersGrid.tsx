"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { deleteSingerRow, upsertSessionSingerRows, type SingerRowInput } from "./actions";

type SingerLite = { id: string; name: string; gender: string | null };

type BhajanLite = {
  id: string;
  title: string;
  lyrics: string | null;
  meaning: string | null;
  referenceGentsPitch: string | null;
  referenceLadiesPitch: string | null;
};

type RowState = SingerRowInput & {
  _localId: string;
  singerName?: string;
  singerGender?: string | null;

  // local UI state
  _bhajanQuery?: string; // what user typed
};

function normalizeGender(g?: string | null): "gents" | "ladies" | null {
  if (!g) return null;
  const x = g.trim().toLowerCase();
  if (["m", "male", "man", "men", "gents", "gent", "boy"].includes(x)) return "gents";
  if (["f", "female", "woman", "women", "ladies", "lady", "girl"].includes(x)) return "ladies";
  return null;
}

function pickRecommendedPitch(singerGender: string | null | undefined, b?: BhajanLite | null) {
  if (!b) return "";
  const g = normalizeGender(singerGender);
  if (g === "ladies") return b.referenceLadiesPitch ?? b.referenceGentsPitch ?? "";
  if (g === "gents") return b.referenceGentsPitch ?? b.referenceLadiesPitch ?? "";
  return b.referenceGentsPitch ?? b.referenceLadiesPitch ?? "";
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
      _bhajanQuery: r.bhajanTitle ?? r.festivalBhajanTitle ?? "",
    }))
  );

  // --- Bhajan search state (per-row) ---
  const [bhSearch, setBhSearch] = useState<
    Record<string, { q: string; items: { id: string; title: string }[]; open: boolean; loading: boolean }>
  >({});

  // --- Pitch suggestion UI for Confirmed Pitch (per-row) ---
  const [pitchUI, setPitchUI] = useState<
    Record<string, { q: string; open: boolean }>
  >({});

  const pitchBoxRef = useRef<Record<string, HTMLDivElement | null>>({});

  function updateRow(localId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (!props.canEdit) return;
    const id = `new_${Math.random().toString(36).slice(2)}`;

    setRows((prev) => [
      ...prev,
      {
        _localId: id,
        id,
        singerId: "",               // ✅ do NOT default singer
        singerName: undefined,
        singerGender: null,

        bhajanId: null,
        bhajanTitle: null,
        festivalBhajanTitle: null,

        confirmedPitch: null,
        alternativeTablaPitch: null,
        recommendedPitch: null,
        raga: null,
        _bhajanQuery: "",
      },
    ]);

    setBhSearch((prev) => ({ ...prev, [id]: { q: "", items: [], open: false, loading: false } }));
    setPitchUI((prev) => ({ ...prev, [id]: { q: "", open: false } }));
  }

  function onSingerChange(localId: string, singerId: string) {
    const s = singerById.get(singerId);
    setRows((prev) =>
      prev.map((r) => {
        if (r._localId !== localId) return r;

        // If there is already a selected bhajanId, we can auto-fill recommended pitch if empty
        // (We only have bhajan pitches after fetching by-id, so we do it on pick.)
        return {
          ...r,
          singerId,
          singerName: s?.name,
          singerGender: s?.gender ?? null,
        };
      })
    );
  }

  async function bhajanSearch(q: string) {
    const res = await fetch(`/api/bhajans/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []) as { id: string; title: string }[];
  }

  async function fetchBhajan(id: string): Promise<BhajanLite | null> {
    const res = await fetch(`/api/bhajans/by-id?id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.bhajan || null) as BhajanLite | null;
  }

  async function onBhajanQueryChange(localId: string, q: string) {
    // Update local text + treat it as free text until user picks a masterlist option
    updateRow(localId, { _bhajanQuery: q, bhajanTitle: q || null, bhajanId: null });

    if (!q.trim()) {
      setBhSearch((prev) => ({ ...prev, [localId]: { q, items: [], open: false, loading: false } }));
      return;
    }

    setBhSearch((prev) => ({ ...prev, [localId]: { q, items: prev[localId]?.items || [], open: true, loading: true } }));
    const items = await bhajanSearch(q);
    setBhSearch((prev) => ({ ...prev, [localId]: { q, items, open: true, loading: false } }));
  }

  async function onPickBhajan(localId: string, bhajanId: string) {
    const b = await fetchBhajan(bhajanId);

    setRows((prev) =>
      prev.map((r) => {
        if (r._localId !== localId) return r;

        const auto = pickRecommendedPitch(r.singerGender ?? null, b);
        const keepExisting = (r.recommendedPitch || "").trim().length > 0;

        return {
          ...r,
          bhajanId,
          bhajanTitle: b?.title ?? r.bhajanTitle ?? null,
          festivalBhajanTitle: null,
          _bhajanQuery: b?.title ?? "",
          recommendedPitch: keepExisting ? r.recommendedPitch : (auto || null),
        };
      })
    );

    setBhSearch((prev) => ({ ...prev, [localId]: { ...(prev[localId] || { q: "", items: [], open: false, loading: false }), open: false } }));
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

  // Custom pitch dropdown for textarea (so it can wrap)
  function setPitchQuery(localId: string, q: string) {
    setPitchUI((prev) => ({ ...prev, [localId]: { q, open: true } }));
    onConfirmedPitchChange(localId, q);
  }

  function pickPitch(localId: string, value: string) {
    setPitchUI((prev) => ({ ...prev, [localId]: { q: value, open: false } }));
    onConfirmedPitchChange(localId, value);
  }

  function closePitch(localId: string) {
    setPitchUI((prev) => ({ ...prev, [localId]: { ...(prev[localId] || { q: "" }), open: false } }));
  }

  function saveAll() {
    if (!props.canEdit) return;

    // ✅ require singer selected for any row being saved
    const missingSinger = rows.some((r) => !r.singerId);
    if (missingSinger) {
      alert("Please select a singer for each row before saving.");
      return;
    }

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

  function filteredPitchOptions(localId: string) {
    const q = (pitchUI[localId]?.q || "").toLowerCase().trim();
    if (!q) return props.suggestions.pitches.slice(0, 25);
    return props.suggestions.pitches
      .filter((p) => p.toLowerCase().includes(q))
      .slice(0, 25);
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
        <table className="min-w-[1040px] w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b">
              <th className="sticky left-0 z-50 bg-slate-50 px-3 py-2 text-left font-semibold w-[180px] border-r shadow-sm">
                Singer
              </th>
              <th className="sticky left-[180px] z-40 bg-slate-50 px-3 py-2 text-left font-semibold w-[260px] border-r shadow-sm">
                Bhajan
              </th>
              <th className="px-3 py-2 text-left font-semibold min-w-[240px]">
                Confirmed Pitch
              </th>
              <th className="px-3 py-2 text-left font-semibold min-w-[240px]">
                Recommended Pitch
              </th>
              <th className="px-3 py-2 text-left font-semibold w-[140px]">Tabla</th>
              {props.canEdit ? <th className="px-3 py-2 text-right font-semibold w-[110px]"> </th> : null}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const bs = bhSearch[r._localId] || { q: r._bhajanQuery || "", items: [], open: false, loading: false };
              const pu = pitchUI[r._localId] || { q: r.confirmedPitch ?? "", open: false };
              const pitchOptions = filteredPitchOptions(r._localId);

              return (
                <tr key={r._localId} className="border-b align-top">
                  {/* Singer (sticky) */}
                  <td className="sticky left-0 z-30 bg-white px-3 py-2 w-[180px] border-r shadow-sm">
                    {props.canEdit ? (
                      <select
                        value={r.singerId || ""}
                        onChange={(e) => onSingerChange(r._localId, e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                      >
                        <option value="">Select singer…</option>
                        {props.singers.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-sm font-medium">{r.singerName ?? "—"}</div>
                    )}

                    <div className="mt-1 text-xs text-gray-600">{r.singerGender ?? "—"}</div>
                  </td>

                  {/* Bhajan (sticky) */}
                  <td className="sticky left-[180px] z-20 bg-white px-3 py-2 w-[260px] border-r shadow-sm">
                    {props.canEdit ? (
                      <div className="relative">
                        <input
                          value={r._bhajanQuery ?? ""}
                          placeholder="Search masterlist…"
                          onChange={(e) => onBhajanQueryChange(r._localId, e.target.value)}
                          onFocus={() => {
                            if ((r._bhajanQuery || "").trim()) {
                              setBhSearch((prev) => ({
                                ...prev,
                                [r._localId]: { ...(prev[r._localId] || bs), open: true },
                              }));
                            }
                          }}
                          className="w-full rounded-xl border px-3 py-2 text-sm"
                        />

                        {bs.open && (bs.loading || bs.items.length > 0) ? (
                          <div className="absolute z-[80] mt-1 w-full max-h-64 overflow-auto rounded-xl border bg-white shadow">
                            {bs.loading ? (
                              <div className="px-3 py-2 text-xs text-gray-600">Searching…</div>
                            ) : null}

                            {bs.items.map((it) => (
                              <button
                                key={it.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => onPickBhajan(r._localId, it.id)}
                              >
                                {it.title}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {r.bhajanId ? (
                          <div className="mt-1 text-[11px] text-gray-500">
                            Linked to masterlist
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="whitespace-normal break-words leading-5">
                        {r.bhajanTitle ?? r.festivalBhajanTitle ?? "—"}
                      </div>
                    )}
                  </td>

                  {/* Confirmed Pitch (main) */}
                  <td className="px-3 py-2">
                    {props.canEdit ? (
                      <div className="relative" ref={(el) => { pitchBoxRef.current[r._localId] = el; }}>
                        <textarea
                          value={pu.q}
                          placeholder="Confirmed (main)"
                          onChange={(e) => setPitchQuery(r._localId, e.target.value)}
                          onFocus={() => setPitchUI((prev) => ({ ...prev, [r._localId]: { q: pu.q, open: true } }))}
                          onBlur={() => {
                            // tiny delay so click on dropdown works
                            setTimeout(() => closePitch(r._localId), 120);
                          }}
                          className="w-full rounded-xl border px-3 py-2 text-sm leading-5 whitespace-pre-wrap resize-y min-h-[44px] focus:ring-2 focus:ring-black/10"
                          rows={2}
                        />

                        {pu.open && pitchOptions.length > 0 ? (
                          <div className="absolute z-[70] mt-1 w-full max-h-64 overflow-auto rounded-xl border bg-white shadow">
                            {pitchOptions.map((p) => (
                              <button
                                key={p}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => pickPitch(r._localId, p)}
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

                  {/* Recommended Pitch (locked) */}
                  <td className="px-3 py-2">
                    <div className="rounded-xl border bg-slate-50 px-3 py-2 whitespace-normal break-words leading-5">
                      {r.recommendedPitch ?? "—"}
                    </div>
                  </td>

                  {/* Tabla (locked) */}
                  <td className="px-3 py-2">
                    <div className="rounded-xl border bg-slate-50 px-3 py-2 whitespace-normal break-words leading-5">
                      {r.confirmedPitch ? (r.alternativeTablaPitch ?? "—") : "—"}
                    </div>
                  </td>

                  {/* Delete */}
                  {props.canEdit ? (
                    <td className="px-3 py-2 text-right">
                      <Button
                        onClick={() => removeRow(r._localId)}
                        className="border-red-300 text-red-700 hover:bg-red-50"
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

      {!props.canEdit ? (
        <div className="text-xs text-gray-600">Read-only mode: open your edit link to add/edit rows.</div>
      ) : null}
    </div>
  );
}