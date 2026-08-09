"use client";

import { useMemo, useRef, useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { DeitySymbols } from "@/components/DeitySymbol";
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
  _bhajanQuery?: string;
  /** Display only. Derived from the bhajan; never sent back to the server. */
  recommendedPitch: string | null;
  raga: string | null;
  deities: string[];
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

type BhSearchState = { q: string; items: { id: string; title: string }[]; open: boolean; loading: boolean };

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
    deities: string[];
    updatedAt: string;
  }>;
  suggestions: {
    pitches: string[];
    pitchToTabla: Record<string, string>;
  };
}) {
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
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
      deities: r.deities,
      updatedAt: r.updatedAt,
      _bhajanQuery: r.bhajanTitle ?? r.festivalBhajanTitle ?? "",
    }))
  );

  const [bhSearch, setBhSearch] = useState<Record<string, BhSearchState>>({});

  // Confirmed pitch UI state (dropdown)
  const [pitchUI, setPitchUI] = useState<Record<string, { q: string; open: boolean }>>({});

  // --- Bhajan dropdown portal state ---
  const [bhPortal, setBhPortal] = useState<{
    open: boolean;
    localId: string | null;
    anchorRect: DOMRect | null;
    items: { id: string; title: string }[];
    loading: boolean;
  }>({ open: false, localId: null, anchorRect: null, items: [], loading: false });

  const bhInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  // Reposition portal on scroll/resize
  useEffect(() => {
    function onMove() {
      if (!bhPortal.open || !bhPortal.localId) return;
      const el = bhInputRef.current[bhPortal.localId];
      if (!el) return;
      setBhPortal((p) => ({ ...p, anchorRect: el.getBoundingClientRect() }));
    }
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [bhPortal.open, bhPortal.localId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setBhPortal((p) => ({ ...p, open: false }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        singerId: "",
        singerName: undefined,
        singerGender: null,
        bhajanId: null,
        bhajanTitle: null,
        festivalBhajanTitle: null,
        confirmedPitch: null,
        alternativeTablaPitch: null,
        recommendedPitch: null,
        raga: null,
        deities: [],
        updatedAt: null,
        _bhajanQuery: "",
      },
    ]);

    setBhSearch((prev) => ({ ...prev, [id]: { q: "", items: [], open: false, loading: false } }));
    setPitchUI((prev) => ({ ...prev, [id]: { q: "", open: false } }));
  }

  function onSingerChange(localId: string, singerId: string) {
    const s = singerById.get(singerId);
    updateRow(localId, { singerId, singerName: s?.name, singerGender: s?.gender ?? null });
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
    updateRow(localId, { _bhajanQuery: q, bhajanTitle: q || null, bhajanId: null });

    if (!q.trim()) {
      setBhSearch((prev) => ({ ...prev, [localId]: { q, items: [], open: false, loading: false } }));
      setBhPortal((p) => (p.localId === localId ? { ...p, open: false } : p));
      return;
    }

    setBhSearch((prev) => ({ ...prev, [localId]: { q, items: prev[localId]?.items || [], open: true, loading: true } }));
    const items = await bhajanSearch(q);
    setBhSearch((prev) => ({ ...prev, [localId]: { q, items, open: true, loading: false } }));

    const el = bhInputRef.current[localId];
    if (el) {
      setBhPortal({ open: true, localId, anchorRect: el.getBoundingClientRect(), items, loading: false });
    }
  }

  async function onPickBhajan(localId: string, bhajanId: string) {
    const b = await fetchBhajan(bhajanId);

    setRows((prev) =>
      prev.map((r) => {
        if (r._localId !== localId) return r;
        // The recommendation follows the bhajan, so it is recomputed outright
        // rather than preserved — a stale value from the previous bhajan would
        // be worse than none.
        return {
          ...r,
          bhajanId,
          bhajanTitle: b?.title ?? r.bhajanTitle ?? null,
          festivalBhajanTitle: null,
          _bhajanQuery: b?.title ?? "",
          recommendedPitch: pickRecommendedPitch(r.singerGender ?? null, b) || null,
        };
      })
    );

    setBhPortal((p) => ({ ...p, open: false }));
  }

  function onConfirmedPitchChange(localId: string, confirmed: string) {
    const tabla = confirmed ? (props.suggestions.pitchToTabla[confirmed] ?? "") : "";
    setRows((prev) =>
      prev.map((r) =>
        r._localId === localId
          ? { ...r, confirmedPitch: confirmed || null, alternativeTablaPitch: confirmed ? (tabla || null) : null }
          : r
      )
    );
  }

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

  function filteredPitchOptions(localId: string) {
    const q = (pitchUI[localId]?.q || "").toLowerCase().trim();
    if (!q) return props.suggestions.pitches.slice(0, 25);
    return props.suggestions.pitches.filter((p) => p.toLowerCase().includes(q)).slice(0, 25);
  }

  function saveAll() {
    if (!props.canEdit) return;

    const missingSinger = rows.some((r) => !r.singerId);
    if (missingSinger) {
      alert("Please select a singer for each row before saving.");
      return;
    }

    setSaveError(null);
    startTransition(async () => {
      // recommendedPitch and raga are deliberately not sent: both are derived
      // from the bhajan and are no longer columns on the slot.
      const payload: SingerRowInput[] = rows.map((r) => ({
        id: r.id,
        singerId: r.singerId,
        bhajanId: r.bhajanId,
        bhajanTitle: r.bhajanTitle,
        festivalBhajanTitle: r.festivalBhajanTitle,
        confirmedPitch: r.confirmedPitch,
        alternativeTablaPitch: r.alternativeTablaPitch,
        updatedAt: r.updatedAt ?? null,
      }));
      try {
        await upsertSessionSingerRows(props.sessionId, payload);
      } catch (e) {
        setSaveError(
          e instanceof Error
            ? e.message
            : "The save did not go through. Your changes are still on screen.",
        );
      }
    });
  }

  function removeRow(localId: string) {
    const row = rows.find((r) => r._localId === localId);
    if (!row || !props.canEdit) return;

    startTransition(async () => {
      if (row.id && !String(row.id).startsWith("new_")) await deleteSingerRow(row.id);
      setRows((prev) => prev.filter((r) => r._localId !== localId));
    });
  }

  const portalEl =
    bhPortal.open && bhPortal.anchorRect
      ? createPortal(
          <div
            style={{
              position: "fixed",
              left: Math.max(8, Math.min(window.innerWidth - 8, bhPortal.anchorRect.left)),
              top: bhPortal.anchorRect.bottom + 6,
              width: Math.min(bhPortal.anchorRect.width, window.innerWidth - 16),
              maxHeight: Math.min(320, window.innerHeight - (bhPortal.anchorRect.bottom + 16)),
              zIndex: 9999,
            }}
            className="overflow-auto rounded-[12px] border border-rule-surface bg-panel shadow-xl"
          >
            {bhPortal.loading ? <div className="px-2 py-1.5 text-xs text-on-surface-muted">Searching…</div> : null}
            {bhPortal.items.length === 0 && !bhPortal.loading ? (
              <div className="px-2 py-1.5 text-xs text-on-surface-muted">No matches.</div>
            ) : null}
            {bhPortal.items.map((it) => (
              <button
                key={it.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-panel-hover"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickBhajan(bhPortal.localId!, it.id)}
              >
                {it.title}
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="grid gap-3">
      {portalEl}

      {saveError ? (
        <div
          role="alert"
          className="rounded-[12px] border border-warn/50 bg-warn/10 px-3 py-2 text-sm"
        >
          {saveError}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Roster entries</div>
        {props.canEdit ? (
          <div className="flex items-center gap-2">
            <Button onClick={addRow}>Add row</Button>
            <Button onClick={saveAll} variant="primary">
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-rule-surface bg-panel">
        <table className="stacked-table w-full min-w-[720px] text-[13px]">
          <thead className="bg-panel">
            <tr className="border-b border-rule-surface">
              <th className="sticky left-0 z-50 bg-panel px-3 py-2 text-left font-semibold w-[132px] border-r shadow-sm">
                Singer
              </th>
              <th className="sticky left-[132px] z-40 bg-panel px-3 py-2 text-left font-semibold w-[280px] border-r shadow-sm">
                Bhajan
              </th>
              <th className="px-2 py-1.5 text-left font-semibold w-[132px]">Confirmed</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">Recommended</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">Tabla</th>
              {props.canEdit ? <th className="px-2 py-1.5 text-right font-semibold" /> : null}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const pu = pitchUI[r._localId] || { q: r.confirmedPitch ?? "", open: false };
              const pitchOptions = filteredPitchOptions(r._localId);

              return (
                <tr key={r._localId} className="border-b align-top">
                  {/* Singer */}
                  <td data-label="Singer" data-key="1" className="sticky left-0 z-30 whitespace-nowrap bg-surface px-2 py-1.5 border-r border-rule-surface shadow-sm">
                    {props.canEdit ? (
                      <select
                        value={r.singerId || ""}
                        onChange={(e) => onSingerChange(r._localId, e.target.value)}
                        className="w-full rounded-[10px] border border-rule-surface bg-field px-2 py-1.5 text-[13px]"
                      >
                        <option value="">Select singer…</option>
                        {props.singers.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-[14px] font-semibold">{r.singerName ?? "—"}</div>
                    )}
                    <div className="mt-1 text-xs text-on-surface-muted">{r.singerGender ?? "—"}</div>
                  </td>

                  {/* Bhajan */}
                  <td data-label="Bhajan" data-key="1" className="px-2 py-1.5">
                    {props.canEdit ? (
                      <input
                        ref={(el) => {
                          bhInputRef.current[r._localId] = el;
                        }}
                        value={r._bhajanQuery ?? ""}
                        placeholder="Search masterlist…"
                        onChange={(e) => onBhajanQueryChange(r._localId, e.target.value)}
                        onFocus={() => {
                          const q = (r._bhajanQuery || "").trim();
                          if (!q) return;
                          // show existing options immediately if we have them
                          const existing = bhSearch[r._localId]?.items || [];
                          const el = bhInputRef.current[r._localId];
                          if (el) {
                            setBhPortal({
                              open: true,
                              localId: r._localId,
                              anchorRect: el.getBoundingClientRect(),
                              items: existing,
                              loading: false,
                            });
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => setBhPortal((p) => ({ ...p, open: false })), 150);
                        }}
                        className="w-full rounded-[10px] border border-rule-surface bg-field px-2 py-1.5 text-[13px]"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <DeitySymbols deities={r.deities} size={16} />
                        <span className="whitespace-normal break-words text-[14px] font-medium leading-5">
                          {r.bhajanTitle ?? r.festivalBhajanTitle ?? "—"}
                        </span>
                      </div>
                    )}

                    {/* Open the song itself — lyrics, meaning, pitches, who
                        has sung it. Previously this said "Linked to
                        masterlist" and went nowhere. */}
                    {r.bhajanId ? (
                      <Link
                        href={`/bhajans/${r.bhajanId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-brass-ink underline-offset-2 hover:underline"
                      >
                        Lyrics &amp; details
                        <span aria-hidden>↗</span>
                        <span className="sr-only">(opens in a new tab)</span>
                      </Link>
                    ) : null}
                  </td>

                  {/* Confirmed Pitch */}
                  <td data-label="Confirmed" data-key="1" className="px-2 py-1.5">
                    {props.canEdit ? (
                      <div className="relative">
                        <input
                          type="text"
                          value={pu.q}
                          placeholder="Confirmed"
                          size={16}
                          onChange={(e) => setPitchQuery(r._localId, e.target.value)}
                          onFocus={() => setPitchUI((prev) => ({ ...prev, [r._localId]: { q: pu.q, open: true } }))}
                          onBlur={() => setTimeout(() => closePitch(r._localId), 120)}
                          className="w-[15ch] rounded-[10px] border-2 border-brass/45 bg-field px-2 py-1.5 text-[14px] font-semibold leading-5"
                        />
                        {pu.open && pitchOptions.length > 0 ? (
                          <div className="absolute z-[60] mt-1 w-full max-h-64 overflow-auto rounded-[12px] border border-rule-surface bg-panel shadow">
                            {pitchOptions.map((p) => (
                              <button
                                key={p}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-panel-hover"
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
                      <div className="whitespace-nowrap text-[14px] font-semibold">{r.confirmedPitch ?? "—"}</div>
                    )}
                  </td>

                  {/* Recommended — derived, never editable. Plain text. */}
                  <td data-label="Recommended" className="whitespace-nowrap px-2 py-1.5 text-[12px] text-on-surface-muted">
                    {r.recommendedPitch ?? "—"}
                  </td>

                  {/* Tabla — derived from the confirmed pitch. Plain text. */}
                  <td data-label="Tabla" className="whitespace-nowrap px-2 py-1.5 text-[12px] text-on-surface-muted">
                    {r.confirmedPitch ? (r.alternativeTablaPitch ?? "—") : "—"}
                  </td>

                  {/* Delete */}
                  {props.canEdit ? (
                    <td data-label="" className="px-2 py-1.5 text-right">
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
    </div>
  );
}