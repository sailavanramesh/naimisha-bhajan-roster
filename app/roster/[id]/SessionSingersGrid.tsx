"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { deleteSingerRow, upsertSessionSingerRows, type SingerRowInput } from "./actions";

type SingerLite = { id: string; name: string; gender: string | null };

type BhajanLite = {
  id: string;
  title: string;
  raga: string | null;
  lyrics: string | null;
  meaning: string | null;
  referenceGentsPitch: string | null;
  referenceLadiesPitch: string | null;
};

type RowState = SingerRowInput & {
  _localId: string;
  singerName?: string;
  singerGender?: string | null;
  _detailsOpen?: boolean;
  _bhajan?: BhajanLite | null;
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const singerById = useMemo(() => new Map(props.singers.map((s) => [s.id, s])), [props.singers]);
  const pitchListId = `pitch-options-${props.sessionId}`;

  // Column widths (tuned to reduce cramped look + keep Bhajan narrower)
  const COL_SINGER = 180;
  const COL_BHAJAN = 260;

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
      _detailsOpen: false,
      _bhajan: null,
    }))
  );

  const [search, setSearch] = useState<Record<string, { q: string; items: { id: string; title: string }[]; open: boolean }>>(
    {}
  );

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

  function updateRow(localId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (!props.canEdit) return;
    const firstSinger = props.singers[0];
    const id = `new_${Math.random().toString(36).slice(2)}`;

    setRows((prev) => [
      ...prev,
      {
        _localId: id,
        id: null as any, // keep compatible with existing action type
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
        _detailsOpen: false,
        _bhajan: null,
      },
    ]);

    setSearch((prev) => ({ ...prev, [id]: { q: "", items: [], open: false } }));
  }

  async function onPickBhajan(localId: string, bhajanId: string) {
    const b = await fetchBhajan(bhajanId);

    setRows((prev) =>
      prev.map((r) => {
        if (r._localId !== localId) return r;
        const auto = pickRecommendedPitch(r.singerGender ?? null, b);
        return {
          ...r,
          bhajanId,
          bhajanTitle: b?.title ?? null,
          _bhajan: b,
          recommendedPitch: (r.recommendedPitch || "").trim() ? r.recommendedPitch : (auto || null),
        };
      })
    );

    setSearch((prev) => ({
      ...prev,
      [localId]: { ...(prev[localId] || { q: "", items: [], open: false }), open: false },
    }));
  }

  async function onSearchChange(localId: string, q: string) {
    setSearch((prev) => ({ ...prev, [localId]: { q, items: prev[localId]?.items || [], open: true } }));
    if (!q.trim()) {
      setSearch((prev) => ({ ...prev, [localId]: { q, items: [], open: false } }));
      return;
    }
    const items = await bhajanSearch(q);
    setSearch((prev) => ({ ...prev, [localId]: { q, items, open: true } }));
  }

  function onSingerChange(localId: string, singerId: string) {
    const s = singerById.get(singerId);
    setRows((prev) =>
      prev.map((r) => {
        if (r._localId !== localId) return r;
        const auto = pickRecommendedPitch(s?.gender ?? null, r._bhajan);
        return {
          ...r,
          singerId,
          singerName: s?.name,
          singerGender: s?.gender ?? null,
          recommendedPitch: (r.recommendedPitch || "").trim() ? r.recommendedPitch : (auto || null),
        };
      })
    );
  }

  function onConfirmedPitchChange(localId: string, confirmed: string) {
    const tabla = confirmed ? props.suggestions.pitchToTabla[confirmed] ?? "" : "";
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

  async function toggleDetails(localId: string) {
    const row = rows.find((r) => r._localId === localId);
    if (!row) return;

    const willOpen = !row._detailsOpen;

    setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, _detailsOpen: !r._detailsOpen } : r)));

    if (willOpen && row.bhajanId && !row._bhajan) {
      const b = await fetchBhajan(row.bhajanId);
      setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, _bhajan: b } : r)));
    }
  }

  function saveAll() {
    if (!props.canEdit) return;
    startTransition(async () => {
      const payload: SingerRowInput[] = rows.map((r) => ({
        id: (r as any).id,
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
      router.refresh();
    });
  }

  function removeRow(localId: string) {
    const row = rows.find((r) => r._localId === localId);
    if (!row || !props.canEdit) return;

    startTransition(async () => {
      if ((row as any).id && !String((row as any).id).startsWith("new_")) {
        await deleteSingerRow((row as any).id);
      }
      setRows((prev) => prev.filter((r) => r._localId !== localId));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      <datalist id={pitchListId}>
        {props.suggestions.pitches.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Roster entries</div>
          <div className="mt-1 text-xs text-gray-600">
            Confirmed Pitch is the main field. Recommended/Tabla are adjuncts.
          </div>
        </div>

        {props.canEdit ? (
          <div className="flex items-center gap-2">
            <Button onClick={addRow}>Add row</Button>
            <Button onClick={saveAll} className="bg-black text-white hover:bg-black/90">
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </div>

      {/* ✅ Always keep grid (including on phone) via horizontal scroll */}
      <div className="-mx-3 overflow-x-auto px-3">
        <div className="min-w-[980px]">
          {/* Header row */}
          <div className="sticky top-0 z-40 rounded-2xl border bg-white">
            <div
              className="grid items-center gap-2 px-2 py-2 text-xs font-semibold text-gray-700"
              style={{
                gridTemplateColumns: `${COL_SINGER}px ${COL_BHAJAN}px 190px 180px 120px 110px`,
              }}
            >
              <div className="sticky left-0 z-50 bg-white px-2 py-2 rounded-xl">Singer</div>
              <div
                className="sticky z-40 bg-white px-2 py-2 rounded-xl"
                style={{ left: COL_SINGER }}
              >
                Bhajan
              </div>
              <div className="px-2 py-2">Confirmed Pitch</div>
              <div className="px-2 py-2">Recommended</div>
              <div className="px-2 py-2">Tabla</div>
              <div className="px-2 py-2 text-right">Actions</div>
            </div>
          </div>

          {/* Rows */}
          <div className="mt-2 grid gap-2">
            {rows.map((r) => {
              const s = search[r._localId] || { q: r.bhajanTitle || "", items: [], open: false };

              return (
                <div key={r._localId} className="rounded-2xl border bg-white">
                  <div
                    className="grid items-start gap-2 px-2 py-2"
                    style={{
                      gridTemplateColumns: `${COL_SINGER}px ${COL_BHAJAN}px 190px 180px 120px 110px`,
                    }}
                  >
                    {/* Singer (sticky) */}
                    <div className="sticky left-0 z-30 bg-white px-2 py-2 rounded-xl">
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
                        <div className="text-sm font-medium">{r.singerName}</div>
                      )}

                      <div className="mt-1 text-[11px] text-gray-600">
                        {r.singerGender ? `Gender: ${r.singerGender}` : "Gender: —"}
                      </div>
                    </div>

                    {/* Bhajan (sticky) — narrower + no overlap */}
                    <div
                      className="sticky z-20 bg-white px-2 py-2 rounded-xl"
                      style={{ left: COL_SINGER }}
                    >
                      <div className="relative">
                        {props.canEdit ? (
                          <>
                            <Input
                              value={s.q}
                              placeholder="Search masterlist…"
                              onChange={(e) => onSearchChange(r._localId, e.target.value)}
                            />

                            {s.open && s.items.length > 0 ? (
                              <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-xl border bg-white shadow">
                                {s.items.map((it) => (
                                  <button
                                    type="button"
                                    key={it.id}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                    onClick={() => onPickBhajan(r._localId, it.id)}
                                  >
                                    {it.title}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="text-sm whitespace-normal break-words">{r.bhajanTitle ?? "—"}</div>
                        )}
                      </div>

                      {r.bhajanTitle ? (
                        <div className="mt-1">
                          <button
                            type="button"
                            onClick={() => toggleDetails(r._localId)}
                            className="text-xs underline underline-offset-2"
                          >
                            {r._detailsOpen ? "Hide lyrics/meaning" : "Show lyrics/meaning"}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {/* Confirmed pitch (stands out + not hidden by sticky cols) */}
                    <div className="px-2 py-2">
                      <Input
                        list={pitchListId}
                        value={r.confirmedPitch ?? ""}
                        placeholder="Confirmed"
                        onChange={(e) => onConfirmedPitchChange(r._localId, e.target.value)}
                        disabled={!props.canEdit}
                        className="bg-violet-50 ring-2 ring-violet-200"
                      />
                      <div className="mt-1 text-[11px] text-gray-600">Main pitch</div>
                    </div>

                    {/* Recommended */}
                    <div className="px-2 py-2">
                      <Input
                        list={pitchListId}
                        value={r.recommendedPitch ?? ""}
                        placeholder="Recommended"
                        onChange={(e) => updateRow(r._localId, { recommendedPitch: e.target.value })}
                        disabled={!props.canEdit}
                      />
                    </div>

                    {/* Tabla */}
                    <div className="px-2 py-2">
                      <Input value={r.confirmedPitch ? r.alternativeTablaPitch ?? "" : ""} placeholder="Tabla" disabled />
                    </div>

                    {/* Actions */}
                    <div className="px-2 py-2 flex justify-end">
                      {props.canEdit ? (
                        <Button onClick={() => removeRow(r._localId)} className="border-red-300 text-red-700 hover:bg-red-50">
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Lyrics/Meaning */}
                  {r.bhajanTitle && r._detailsOpen ? (
                    <div className="mx-2 mb-2 rounded-xl border bg-gray-50 p-3 text-sm">
                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs font-semibold text-gray-700 mb-1">Lyrics</div>
                          <div className="whitespace-pre-wrap">{r._bhajan ? r._bhajan.lyrics ?? "—" : "Loading…"}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-700 mb-1">Meaning</div>
                          <div className="whitespace-pre-wrap">{r._bhajan ? r._bhajan.meaning ?? "—" : "Loading…"}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {props.canEdit ? (
        <div className="text-xs text-gray-600">
          Tip: select a bhajan from the dropdown (not just typing) to link it to the masterlist. Tabla auto-fills only after Confirmed Pitch is set.
        </div>
      ) : null}
    </div>
  );
}
