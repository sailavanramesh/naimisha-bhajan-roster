"use client";

import { useMemo, useRef, useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { DeitySymbols } from "@/components/DeitySymbol";
import { Button } from "@/components/ui";
import { deleteSingerRow, upsertSessionSingerRows, type SingerRowInput } from "./actions";
import { useMicCushions, MicCushionDots, cushionTint } from "@/components/MicCushions";
import { stepWithinSeries } from "@/lib/pitch";
import { tablaWithOverride } from "@/lib/tabla";
import { ragaScale } from "@/lib/ragaScales";

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
  canSetMicCushion: boolean;
  tablaOverrides: Record<string, string | null>;
  canEdit: boolean;
  /** May move singers between slots. Members may not. */
  canAssign: boolean;
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

  /*
   * Mic cushions live alongside the singer, not the slot: one singer has one
   * mic for the night, so a singer with two bhajans shows the same cushion on
   * both rows and setting it on either sets both.
   */
  const cushions = useMicCushions(props.sessionId);

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

  /*
   * Reordering.
   *
   * Order carries meaning here — CLAUDE.md: "the set builds; it does not start
   * fast" — so moving a bhajan up or down is a real editing action.
   *
   * Two ways: the arrows, and the grip.
   *
   * The grip is POINTER events, not HTML5 drag-and-drop. The first attempt used
   * the drag API, which does not fire for touch at all — so on a phone the grip
   * was either hidden or inert, which is what Sailavan hit. Pointer events are
   * one API for touch, mouse and stylus, so the same handful of lines works
   * everywhere and there is nothing left that only works on a desktop.
   *
   * The row is reordered as the finger crosses it rather than dragged as a
   * floating ghost: the row itself moves under the pointer, so what you see
   * during the drag is what you will have when you let go. Because the moved
   * row follows the pointer, the pointer stays over it and the next crossing is
   * measured from where it now is.
   *
   * The arrows stay. They are what a keyboard reaches, and what you want when
   * the thing you are moving is one place out.
   *
   * Position is not stored per row: saveAll writes position by array index, so
   * moving rows in this array IS the reorder. It takes effect on Save with
   * everything else.
   */
  const moveRow = (localId: string, delta: number) =>
    setRows((prev) => {
      const from = prev.findIndex((r) => r._localId === localId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });

  /** The row elements, so a drag can ask which one the pointer is over. */
  const rowEls = useRef<Record<string, HTMLTableRowElement | null>>({});
  const draggingRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const onGripDown = (localId: string) => (e: React.PointerEvent<HTMLElement>) => {
    // Capture so the drag survives the pointer leaving the little grip, which
    // it does immediately — the grip is 20px tall and rows are not.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests have no real pointer to capture. Harmless.
    }
    draggingRef.current = localId;
    setDraggingId(localId);
  };

  const onGripMove = (e: React.PointerEvent<HTMLElement>) => {
    const id = draggingRef.current;
    if (!id) return;
    // Without this the page scrolls under the finger instead of the row moving.
    e.preventDefault();
    const y = e.clientY;

    setRows((prev) => {
      const from = prev.findIndex((r) => r._localId === id);
      if (from < 0) return prev;

      let to = from;
      for (let i = 0; i < prev.length; i++) {
        const el = rowEls.current[prev[i]._localId];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          to = i;
          break;
        }
      }
      if (to === from) return prev;

      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const onGripUp = () => {
    draggingRef.current = null;
    setDraggingId(null);
  };

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

  /**
   * Move the confirmed pitch one rung up or down its own shruti series.
   *
   * When nothing is confirmed yet this steps from the RECOMMENDED pitch, so
   * the first press lands one semitone off the recommendation. Taking the
   * recommendation unchanged is what the "= rec" button is for — keeping the
   * two actions distinct rather than one being a slower route to the other.
   */
  function nudgePitch(localId: string, direction: 1 | -1) {
    if (!props.canEdit) return;
    const row = rows.find((x) => x._localId === localId);
    if (!row) return;
    const next = stepWithinSeries(
      row.confirmedPitch,
      direction,
      props.suggestions.pitches,
      row.recommendedPitch,
    );
    if (next) pickPitch(localId, next);
  }

  function copyRecommended(localId: string) {
    if (!props.canEdit) return;
    const row = rows.find((x) => x._localId === localId);
    if (!row?.recommendedPitch) return;
    pickPitch(localId, row.recommendedPitch);
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
        {props.canAssign ? (
          <div className="flex items-center gap-2">
            <Button onClick={addRow}>Add row</Button>
            <Button onClick={saveAll} variant="primary">
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-rule-surface bg-panel">
        {/*
          table-fixed, not auto.
          
          Auto layout ignores the declared widths and sizes every column by its
          content, so on a phone in landscape the singer select and the row of
          pitch buttons took what they wanted — Singer 204px, Confirmed 184px —
          and the bhajan, the one column whose content is a long name, was left
          with 102px. Fixed layout honours the header widths and gives the
          leftover to the bhajan, which is the column that can use it.
        */}
        <table className="stacked-table w-full min-w-[720px] table-fixed text-[13px]">
          <thead className="bg-panel">
            <tr className="border-b border-rule-surface">
              {/* Widths are real now that the table is fixed. Everything the
                  bhajan does not need is spent here, and it gets the rest. */}
              <th className="sticky left-0 z-50 w-[152px] border-r bg-panel px-3 py-2 text-left font-semibold shadow-sm">
                Singer
              </th>
              <th className="sticky left-[152px] z-40 border-r bg-panel px-3 py-2 text-left font-semibold shadow-sm">
                Bhajan
              </th>
              <th className="w-[150px] px-2 py-1.5 text-left font-semibold">Confirmed</th>
              <th className="w-[112px] whitespace-nowrap px-2 py-1.5 text-left font-semibold">
                Recommended
              </th>
              <th className="w-[56px] whitespace-nowrap px-2 py-1.5 text-left font-semibold">
                Tabla
              </th>
              {props.canEdit ? <th className="w-[84px] px-2 py-1.5 text-right font-semibold" /> : null}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const pu = pitchUI[r._localId] || { q: r.confirmedPitch ?? "", open: false };
              const pitchOptions = filteredPitchOptions(r._localId);

              /*
               * Tint the whole row with the singer's mic cushion colour, so the
               * sound desk can match a row to a physical cushion at a glance
               * without reading the dots. Kept very light: this sits behind
               * body text that has to stay comfortably readable, and the dots
               * remain the precise signal.
               */
              const tint = cushionTint(cushions.get(r.singerId ?? "")?.colour ?? null);

              return (
                <tr
                  key={r._localId}
                  ref={(el) => {
                    rowEls.current[r._localId] = el;
                  }}
                  className={[
                    "border-b align-top",
                    draggingId === r._localId
                      ? "outline outline-2 -outline-offset-2 outline-brass"
                      : "",
                  ].join(" ")}
                  style={tint ? { background: tint.row } : undefined}
                >
                  {/* Singer */}
                  <td
                    data-label="Singer"
                    data-key="1"
                    className="sticky left-0 z-30 whitespace-nowrap bg-surface px-2 py-1.5 border-r border-rule-surface shadow-sm"
                    style={
                      tint
                        ? { background: tint.row, boxShadow: `inset 3px 0 0 0 ${tint.edge}` }
                        : undefined
                    }
                  >
                    {props.canAssign ? (
                      /*
                        Number, singer, arrows on ONE line.
                        
                        The number and the arrows first sat on a line of their
                        own above the select, which read as clutter in the
                        stacked card view a phone gets in portrait — a whole
                        extra row for two tiny buttons. Inline they cost no
                        height at all, and the number sits where a position
                        number belongs: in front of the person.
                      */
                      <div className="flex w-full min-w-0 items-center gap-1.5">
                        {/*
                          The grip, on every screen this time.
                          
                          touch-action: none is the line that makes it work on
                          a phone: without it the browser claims the gesture for
                          scrolling before any pointermove reaches us.
                        */}
                        <span
                          onPointerDown={onGripDown(r._localId)}
                          onPointerMove={onGripMove}
                          onPointerUp={onGripUp}
                          onPointerCancel={onGripUp}
                          style={{ touchAction: "none" }}
                          role="button"
                          tabIndex={-1}
                          aria-hidden
                          title="Drag to reorder"
                          className="-ms-1 shrink-0 cursor-grab select-none px-1 py-1 text-[13px] leading-none text-on-surface-muted active:cursor-grabbing"
                        >
                          ⠿
                        </span>
                        <span className="w-3 shrink-0 font-mono text-[11px] text-on-surface-muted">
                          {rows.indexOf(r) + 1}
                        </span>
                        <select
                          value={r.singerId || ""}
                          onChange={(e) => onSingerChange(r._localId, e.target.value)}
                          className="min-w-0 flex-1 rounded-[10px] border border-rule-surface bg-field px-2 py-1.5 text-[13px]"
                        >
                          <option value="">Select singer…</option>
                          {props.singers.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>

                        {/* Stacked, so the pair is no taller than the select. */}
                        <span className="flex shrink-0 flex-col gap-px">
                          <button
                            type="button"
                            onClick={() => moveRow(r._localId, -1)}
                            disabled={rows.indexOf(r) === 0}
                            aria-label={`Move ${r.singerName ?? "this row"} up`}
                            title="Move up"
                            className="h-[15px] w-5 rounded-t border border-rule-surface bg-field text-[8px] leading-none text-on-surface-muted hover:border-brass/50 hover:text-on-surface disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRow(r._localId, 1)}
                            disabled={rows.indexOf(r) === rows.length - 1}
                            aria-label={`Move ${r.singerName ?? "this row"} down`}
                            title="Move down"
                            className="h-[15px] w-5 rounded-b border border-rule-surface bg-field text-[8px] leading-none text-on-surface-muted hover:border-brass/50 hover:text-on-surface disabled:opacity-30"
                          >
                            ▼
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div className="text-[14px] font-semibold">{r.singerName ?? "—"}</div>
                    )}
                    <div className="mt-1 text-xs text-on-surface-muted">{r.singerGender ?? "—"}</div>
                    {r.singerId ? (
                      <MicCushionDots
                        singerId={r.singerId}
                        controller={cushions}
                        canSet={props.canSetMicCushion}
                      />
                    ) : null}
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
                        <div className="relative w-fit">
                        <input
                          type="text"
                          value={pu.q}
                          placeholder="Confirmed"
                          size={16}
                          onChange={(e) => setPitchQuery(r._localId, e.target.value)}
                          onFocus={() => setPitchUI((prev) => ({ ...prev, [r._localId]: { q: pu.q, open: true } }))}
                          onBlur={() => setTimeout(() => closePitch(r._localId), 120)}
                          onKeyDown={(e) => {
                            // Arrow keys step the ladder. Cheap to add and it
                            // is what a keyboard user reaches for first.
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                              nudgePitch(r._localId, e.key === "ArrowUp" ? 1 : -1);
                            }
                          }}
                          /* 20ch fits the longest label, "1.5 Madhyam / F#", with room for the
   clear button. At 15ch it was clipped even before the button existed —
   the harmonium player reads this field, so a cut-off "#" is a real
   misread waiting to happen. */
                          className={`w-[20ch] rounded-[10px] border-2 border-brass/45 bg-field py-1.5 pl-2 text-[14px] font-semibold leading-5 ${pu.q ? "pr-7" : "pr-2"}`}
                        />
                        {/* Clear sits inside the field, the way a search box
                            clears. onMouseDown is prevented so the input does
                            not blur and close the dropdown before the click
                            lands. */}
                        {pu.q ? (
                          <button
                            type="button"
                            aria-label="Clear the confirmed pitch"
                            title="Clear the confirmed pitch"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickPitch(r._localId, "")}
                            className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[13px] leading-none text-on-surface-muted transition hover:bg-rule-surface hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
                          >
                            <span aria-hidden>×</span>
                          </button>
                        ) : null}
                        </div>
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

                        {/* Step the ladder without opening the dropdown. The
                            dropdown is still the only way to cross between
                            Madhyam and Pancham, which is deliberate. */}
                        <div className="mt-1 flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Shruti down one semitone"
                            title="Down one semitone (or press ↓ in the field)"
                            onClick={() => nudgePitch(r._localId, -1)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] border border-rule-surface bg-field text-[13px] leading-none hover:border-brass/50"
                          >
                            −
                          </button>
                          <button
                            type="button"
                            aria-label="Shruti up one semitone"
                            title="Up one semitone (or press ↑ in the field)"
                            onClick={() => nudgePitch(r._localId, 1)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] border border-rule-surface bg-field text-[13px] leading-none hover:border-brass/50"
                          >
                            +
                          </button>
                          {r.recommendedPitch && r.confirmedPitch !== r.recommendedPitch ? (
                            <button
                              type="button"
                              onClick={() => copyRecommended(r._localId)}
                              title={`Use the recommended pitch (${r.recommendedPitch})`}
                              className="inline-flex h-6 items-center rounded-[8px] border border-rule-surface bg-field px-1.5 text-[11px] leading-none text-on-surface-muted hover:border-brass/50 hover:text-on-surface"
                            >
                              = rec
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="whitespace-nowrap text-[14px] font-semibold">{r.confirmedPitch ?? "—"}</div>
                    )}
                  </td>

                  {/* Recommended — derived, never editable. Plain text. */}
                  <td data-label="Recommended" className="whitespace-nowrap px-2 py-1.5 text-[12px] text-on-surface-muted">
                    {r.recommendedPitch ?? "—"}
                  </td>

                  {/*
                    Tabla — the drum to TUNE, not the old Sa + 7.
                    
                    Sa + 7 is the fifth, which is only an answer when the ashram
                    happens to own that note; it owns C, C#, D and E. Recomputed
                    here in the browser so it follows the confirmed pitch as it
                    is edited, and honouring any override a coordinator has set.
                  */}
                  <td data-label="Tabla" className="whitespace-nowrap px-2 py-1.5 text-[13px]">
                    {(() => {
                      if (!r.confirmedPitch) return <span className="text-on-surface-muted">—</span>;
                      const { note, overridden } = tablaWithOverride(
                        r.confirmedPitch,
                        r.raga,
                        ragaScale(r.raga),
                        props.tablaOverrides,
                      );
                      if (!note) {
                        return (
                          <span className="text-warn" title="No ashram tabla fits this pitch">
                            none fits
                          </span>
                        );
                      }
                      return (
                        <span className="font-mono font-semibold" title={overridden ? "set by hand" : "computed"}>
                          {note}
                          {overridden ? (
                            <span className="ml-1 font-sans text-[10px] font-normal text-on-surface-muted">
                              set
                            </span>
                          ) : null}
                        </span>
                      );
                    })()}
                  </td>

                  {/* Delete */}
                  {props.canAssign ? (
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