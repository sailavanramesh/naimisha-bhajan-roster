"use client";

import { useMemo, useRef, useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeitySymbols } from "@/components/DeitySymbol";
import { Button } from "@/components/ui";
import { deleteSingerRow, upsertSessionSingerRows, type SingerRowInput } from "./actions";
import { useMicCushions, MicCushionDots, cushionTint } from "@/components/MicCushions";
import type { ChorusMic } from "@/lib/micCushion";
import { ChorusCell } from "./ChorusCell";
import { LeaveWithChangesDialog } from "@/components/LeaveWithChangesDialog";
import {
  describeChanges,
  draftKey,
  readDraft,
  restorePlan,
  ageLabel,
  type DraftRow,
  type StoredDraft,
} from "@/lib/rosterDraft";
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
  /** Read-only here: ChorusCell writes these itself, outside the grid's save. */
  chorus?: ChorusMic[];
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

/**
 * A row reduced to what a person can change, for comparing against what was
 * loaded and for keeping on the device. `_localId` is the identity rather than
 * `id`, because it survives a save turning a `new_…` row into a real one.
 */
function toDraftRow(r: RowState): DraftRow {
  return {
    id: r._localId,
    singerId: r.singerId,
    singerName: r.singerName ?? null,
    bhajanId: r.bhajanId,
    bhajanTitle: r.bhajanTitle,
    festivalBhajanTitle: r.festivalBhajanTitle,
    confirmedPitch: r.confirmedPitch,
    alternativeTablaPitch: r.alternativeTablaPitch,
  };
}

type BhSearchState = { q: string; items: { id: string; title: string }[]; open: boolean; loading: boolean };

/**
 * Where the suggestion list goes, given the field it belongs to.
 *
 * Measured against the VISUAL viewport, so a phone keyboard shrinking the
 * visible area is accounted for rather than ignored.
 *
 * Two things the old version got wrong on a phone. Its height was
 * `viewportHeight - fieldBottom`, which collapses to nothing — or below
 * nothing — when the field sits low on the screen, which it does as soon as
 * the keyboard is up. And it always opened downwards, into the keyboard. It
 * flips above the field when there is more room there, and never renders
 * shorter than a couple of options.
 */
function dropdownBox(rect: DOMRect): {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
} {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const viewTop = vv?.offsetTop ?? 0;
  const viewLeft = vv?.offsetLeft ?? 0;
  const viewHeight = vv?.height ?? window.innerHeight;
  const viewWidth = vv?.width ?? window.innerWidth;

  const GAP = 6;
  const MARGIN = 8;
  const MIN = 120;
  const MAX = 320;

  const roomBelow = viewTop + viewHeight - rect.bottom - GAP - MARGIN;
  const roomAbove = rect.top - viewTop - GAP - MARGIN;
  const flip = roomBelow < MIN && roomAbove > roomBelow;

  const maxHeight = Math.max(MIN, Math.min(MAX, flip ? roomAbove : roomBelow));
  const width = Math.min(rect.width, viewWidth - MARGIN * 2);

  return {
    left: Math.max(viewLeft + MARGIN, Math.min(rect.left, viewLeft + viewWidth - MARGIN - width)),
    top: flip ? rect.top - GAP - maxHeight : rect.bottom + GAP,
    width,
    maxHeight,
  };
}

/** Cache key for a singer-and-bhajan pair. */
function hintKey(singerId: string, bhajanId: string): string {
  return `${singerId}|${bhajanId}`;
}

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
    /** The chorus mics on this bhajan. Written by ChorusCell, not by the save. */
    chorus: ChorusMic[];
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
  const router = useRouter();

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
      chorus: r.chorus,
      updatedAt: r.updatedAt,
      _bhajanQuery: r.bhajanTitle ?? r.festivalBhajanTitle ?? "",
    }))
  );

  /*
   * UNSAVED WORK.
   *
   * Edits live in this component until somebody presses Save, and three things
   * can take them away: navigating inside the app, closing or reloading the
   * tab, and — the likeliest one in a hall — the phone locking or Safari
   * dropping the tab while the singer is in another app.
   *
   * Only the first can be stopped with our own dialog. The browser will show
   * nothing but its own generic sentence for the second, and nothing at all
   * for the third. So the edits are also written to the device, and offered
   * back on return. See lib/rosterDraft.ts.
   *
   * `baseline` is what the grid was last in agreement with the database about:
   * what loaded, and then whatever each save wrote.
   */
  const [baseline, setBaseline] = useState<DraftRow[]>(() =>
    props.initialRows.map((r) => ({
      id: r.id,
      singerId: r.singerId,
      singerName: r.singerName,
      bhajanId: r.bhajanId,
      bhajanTitle: r.bhajanTitle,
      festivalBhajanTitle: r.festivalBhajanTitle,
      confirmedPitch: r.confirmedPitch,
      alternativeTablaPitch: r.alternativeTablaPitch,
    })),
  );
  const draftRows = useMemo(() => rows.map(toDraftRow), [rows]);
  const changes = useMemo(
    () =>
      describeChanges(baseline, draftRows, {
        // Choosing a pitch moves the tabla with it, and counting that as a
        // second change made a single edit read as "2 unsaved changes".
        tablaFor: (p) => (p ? (props.suggestions.pitchToTabla[p] ?? null) : null),
      }),
    [baseline, draftRows, props.suggestions.pitchToTabla],
  );
  const dirty = changes.length > 0;

  /**
   * Where somebody was trying to go when the dialog stopped them — a page, or
   * backwards, which is not a page and has to be replayed differently.
   */
  const [leaveTo, setLeaveTo] = useState<{ kind: "href"; href: string } | { kind: "back" } | null>(
    null,
  );
  /** A draft found on the device, waiting to be accepted or thrown away. */
  const [offer, setOffer] = useState<StoredDraft | null>(null);
  /** Rows a restored draft did NOT put back, because somebody else had. */
  const [heldBack, setHeldBack] = useState<string[]>([]);

  const forgetDraft = () => {
    try {
      window.localStorage.removeItem(draftKey(props.sessionId));
    } catch {
      // Private browsing, or storage full. Losing the draft is the cost.
    }
  };

  /*
   * On arrival, is there work here from last time?
   *
   * This runs BEFORE the effect that keeps the draft written, and that order
   * is load-bearing: a page opens with nothing unsaved, so the writer's first
   * act would be to clear the very draft this is trying to offer. Effects run
   * in the order they are declared, and the ref below is set on the first pass,
   * which is what the writer waits for.
   *
   * Only offered if it still differs from what the database now holds —
   * otherwise somebody saved it from another device in the meantime and the
   * offer would be noise.
   */
  const askedForDraft = useRef(false);
  useEffect(() => {
    if (askedForDraft.current || !props.canEdit) return;
    askedForDraft.current = true;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(draftKey(props.sessionId));
    } catch {
      return;
    }
    const found = readDraft(raw, Date.now());
    if (!found) return;
    if (describeChanges(baseline, found.rows).length === 0) {
      forgetDraft();
      return;
    }
    setOffer(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sessionId, props.canEdit, baseline]);

  /*
   * Keep the draft current, a moment behind the typing.
   *
   * Debounced because this runs on every keystroke in a bhajan field, and
   * writing to storage is synchronous — on a mid-range phone that is exactly
   * the sort of thing that makes typing feel heavy.
   */
  useEffect(() => {
    if (!props.canEdit) return;
    // Nothing may touch storage until it has been read (see above), and an
    // offer nobody has answered yet owns what is in there.
    if (!askedForDraft.current || offer) return;
    if (!dirty) {
      forgetDraft();
      return;
    }
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          draftKey(props.sessionId),
          // `base` is what these edits were made to. Restoring needs it to
          // tell this draft apart from somebody else's newer save.
          JSON.stringify({ savedAt: Date.now(), rows: draftRows, base: baseline }),
        );
      } catch {
        // Nothing to be done, and nothing worth interrupting anybody over.
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draftRows, props.sessionId, props.canEdit, offer]);

  /*
   * Closing or reloading the tab.
   *
   * The browser substitutes its own wording and offers no Save button; this is
   * a speed bump, not the dialog. Registered only while there is something to
   * lose, so an untouched page never asks.
   */
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  /*
   * Going somewhere else in the app.
   *
   * The App Router has no navigation guard, so links are caught on the way
   * past — capture phase, before the router sees the click. Left button only,
   * and never for a modified click, a new tab, a download or another site:
   * those either leave the page intact or are the browser's business.
   */
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page — a jump to an anchor loses nothing.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      setLeaveTo({ kind: "href", href: `${url.pathname}${url.search}${url.hash}` });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  /*
   * Going BACK — the swipe on a phone, the button on a laptop.
   *
   * Back is not a link, so nothing above catches it, and there is no way to
   * cancel it once it has happened. The only thing that works is to be
   * standing behind it: while there is unsaved work, one extra history entry
   * for this same page is pushed, so the first Back lands on that instead of
   * leaving. The entry is pushed again straight away and the dialog asks.
   *
   * Nothing moves on screen — same URL, same page — so somebody who came back
   * on purpose sees only the question.
   *
   * The entry is taken away again the moment there is nothing to lose, so Back
   * never needs pressing twice on a page that is up to date.
   */
  const guardsHistory = useRef(false);
  useEffect(() => {
    if (!props.canEdit) return;

    if (!dirty) {
      if (guardsHistory.current) {
        guardsHistory.current = false;
        // Only ours to remove, and only if it is still the entry we are on.
        if (window.history.state?.__rosterGuard) window.history.back();
      }
      return;
    }
    if (guardsHistory.current) return;

    guardsHistory.current = true;
    window.history.pushState(
      { ...window.history.state, __rosterGuard: true },
      "",
      window.location.href,
    );

    const onPop = () => {
      if (!guardsHistory.current) return;
      // Stand behind it again, so a second Back is asked about too.
      window.history.pushState(
        { ...window.history.state, __rosterGuard: true },
        "",
        window.location.href,
      );
      setLeaveTo({ kind: "back" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dirty, props.canEdit]);

  /**
   * Put a draft back, without treading on anybody.
   *
   * A draft can be hours old, and a row it wants to change may have been saved
   * by somebody else since. Those rows keep the saved version and are listed
   * instead — a `confirmedPitch` exists nowhere else, so it is not something to
   * overwrite from a stale copy on somebody's phone.
   */
  function restoreDraft() {
    if (!offer) return;
    // Against what the draft was edited FROM, not against this page:
    // that is what distinguishes my stale draft from their fresh save.
    const plan = restorePlan(offer.rows, offer.base, draftRows);

    setRows((prev) => {
      const byLocalId = new Map(prev.map((r) => [r._localId, r]));
      return plan.rows.map((d) => {
        const existing = byLocalId.get(d.id);
        const singer = singerById.get(d.singerId);
        const query = d.bhajanTitle ?? d.festivalBhajanTitle ?? "";

        if (existing) {
          return {
            ...existing,
            singerId: d.singerId,
            singerName: singer?.name ?? existing.singerName,
            singerGender: singer?.gender ?? existing.singerGender,
            bhajanId: d.bhajanId,
            bhajanTitle: d.bhajanTitle,
            festivalBhajanTitle: d.festivalBhajanTitle,
            confirmedPitch: d.confirmedPitch,
            alternativeTablaPitch: d.alternativeTablaPitch,
            _bhajanQuery: query,
          };
        }

        // A row that was added and never saved. Its recommendation is derived
        // from the bhajan on the server, so it fills in on the next save
        // rather than being guessed at here.
        return {
          _localId: d.id,
          id: d.id,
          singerId: d.singerId,
          singerName: singer?.name ?? d.singerName ?? "",
          singerGender: singer?.gender ?? null,
          bhajanId: d.bhajanId,
          bhajanTitle: d.bhajanTitle,
          festivalBhajanTitle: d.festivalBhajanTitle,
          confirmedPitch: d.confirmedPitch,
          alternativeTablaPitch: d.alternativeTablaPitch,
          recommendedPitch: null,
          raga: null,
          deities: [],
          updatedAt: null,
          _bhajanQuery: query,
        } satisfies RowState;
      });
    });

    setHeldBack(plan.conflicts);
    setOffer(null);
  }

  function discardOffer() {
    forgetDraft();
    setOffer(null);
  }

  function leaveNow(target: { kind: "href"; href: string } | { kind: "back" }) {
    setLeaveTo(null);
    // Stood down first, so that clearing up after it is never mistaken for
    // somebody pressing Back again.
    const wasGuarding = guardsHistory.current;
    guardsHistory.current = false;

    if (target.kind === "href") {
      /*
       * REPLACE, not push, when the guard is up.
       *
       * The extra entry the guard added is the one we are standing on, so the
       * new page takes its place. Pushing instead left it in the stack, and
       * two things went wrong: the save's own tidying-up called
       * `history.back()` on it at the same moment as the navigation, so Save
       * and leave could land back on the session it had just left; and Back
       * from the new page then needed two presses to get past the session.
       */
      if (wasGuarding) router.replace(target.href);
      else router.push(target.href);
      return;
    }

    // Going back for real: over the extra entry, and over the page itself.
    window.history.go(-2);
  }

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

  /*
   * What this singer would sing THIS bhajan at, offered as one tap.
   *
   * Sailavan: "if its in their list as a song they know, have sung, or have a
   * shruti/pitch for … the suggestion saves time and gives them something they
   * can straight away select."
   *
   * It is emphatically not the recommendation, which stays exactly where it
   * is: the recommendation is what the masterlist says for that voice, and
   * this is what this person has actually done with this bhajan. The two
   * disagree often, and both are worth seeing.
   *
   * Never filled in automatically. confirmedPitch is the historical record;
   * writing a guess into it and calling it history is the one thing this app
   * must not do.
   */
  type PitchHint = { pitch: string; source: string; times: number; lastOn: string | null };
  const [pitchHint, setPitchHint] = useState<Record<string, PitchHint | null>>({});

  useEffect(() => {
    // One lookup per row whose singer-and-bhajan pair is new to us.
    const wanted = rows.filter(
      (r) => r.singerId && r.bhajanId && pitchHint[hintKey(r.singerId, r.bhajanId)] === undefined,
    );
    if (wanted.length === 0) return;

    let live = true;
    void (async () => {
      for (const r of wanted) {
        const key = hintKey(r.singerId!, r.bhajanId!);
        try {
          const res = await fetch(
            `/api/pitch/suggest?singerId=${encodeURIComponent(r.singerId!)}&bhajanId=${encodeURIComponent(r.bhajanId!)}`,
          );
          if (!live) return;
          if (!res.ok) {
            setPitchHint((prev) => ({ ...prev, [key]: null }));
            continue;
          }
          const data = await res.json();
          const pitch: string | null = data?.suggestion?.pitch ?? null;
          const source: string = data?.suggestion?.source ?? "none";
          // Only worth a chip when it comes from this singer's own history or
          // their list. "reference" and "predicted" are what the Recommended
          // column already says, more or less, and a second chip repeating it
          // is noise.
          /*
           * Three sources are worth a chip, and one is not.
           *
           * sung / list  what this person has actually done with this bhajan.
           * predicted    their own median offset applied to the reference —
           *              NOT the reference, which is the difference that makes
           *              it worth showing. Sailavan: "you're already
           *              calculating it in every bhajan, might as well bring
           *              it in."
           * reference    the bare masterlist value, which is exactly what the
           *              Recommended column beside it already says. A chip
           *              repeating the number next to it is noise.
           */
          const useful =
            pitch && (source === "sung" || source === "list" || source === "predicted");
          setPitchHint((prev) => ({
            ...prev,
            [key]: useful
              ? { pitch: pitch!, source, times: data?.sung?.times ?? 0, lastOn: data?.sung?.lastOn ?? null }
              : null,
          }));
        } catch {
          if (live) setPitchHint((prev) => ({ ...prev, [key]: null }));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [rows, pitchHint]);

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

  /*
   * Which suggestion the arrow keys are on.
   *
   * The list was mouse-only: typing a title and pressing Down moved the text
   * caret instead of the highlight, so on a keyboard there was no way to take
   * a suggestion without reaching for the mouse. -1 means "none yet", so the
   * first Down lands on the first result rather than the second.
   */
  const [bhActive, setBhActive] = useState(-1);
  const bhOptionRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const onBhajanKeyDown = (localId: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!bhPortal.open || bhPortal.localId !== localId) return;
    const n = bhPortal.items.length;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (n === 0) return;
      // Otherwise the caret jumps to the end of the text as well.
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setBhActive((prev) => {
        const next = prev < 0 ? (step === 1 ? 0 : n - 1) : (prev + step + n) % n;
        bhOptionRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
      return;
    }

    if (e.key === "Enter") {
      if (bhActive < 0 || !bhPortal.items[bhActive]) return;
      // Only swallow Enter when it is actually choosing something, so the key
      // still does whatever it did before in a row with no list open.
      e.preventDefault();
      onPickBhajan(localId, bhPortal.items[bhActive].id);
      setBhActive(-1);
      return;
    }

    if (e.key === "Escape") {
      setBhPortal((prev) => ({ ...prev, open: false }));
      setBhActive(-1);
    }
  };

  /*
   * Keep the suggestion list stuck to its field.
   *
   * The visualViewport listeners are the ones that matter on a phone: opening
   * the keyboard changes the VISUAL viewport without changing the layout
   * viewport, and a position:fixed list is placed against the layout one — so
   * the list drifted away from the field it belonged to and appeared to start
   * somewhere above it.
   */
  useEffect(() => {
    function onMove() {
      if (!bhPortal.open || !bhPortal.localId) return;
      const el = bhInputRef.current[bhPortal.localId];
      if (!el) return;
      setBhPortal((p) => ({ ...p, anchorRect: el.getBoundingClientRect() }));
    }
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    window.visualViewport?.addEventListener("resize", onMove);
    window.visualViewport?.addEventListener("scroll", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("scroll", onMove);
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
    /*
     * The recommendation goes with the bhajan.
     *
     * onPickBhajan recomputes it for exactly this reason, but typing a title
     * that is not in the masterlist took the other path: it cleared the
     * bhajan and left the previous one's recommendation on screen. So a brand
     * new song showed "5 Pancham / G" — the value belonging to whatever had
     * been in that row a moment earlier — which is worse than showing nothing,
     * because it looks like an answer.
     */
    updateRow(localId, {
      _bhajanQuery: q,
      bhajanTitle: q || null,
      bhajanId: null,
      recommendedPitch: null,
    });

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
    const row = rows.find((r) => r._localId === localId);

    /*
     * A SHRUTI THE SINGER SAVED ON THEIR OWN LIST COMES IN WITH THE BHAJAN.
     *
     * Sailavan: "if someone populates the 'shruti you want', it should come in as
     * the pre-selected pitch for the song when adding to the roster."
     *
     * This does not break the rule that a guess is never written into
     * `confirmedPitch`, because a saved shruti is not a guess — it is the singer
     * saying what they sing this at, which is the same standing they have when
     * they say it out loud on the night. The assign panel has always carried it
     * across for the same reason; the grid was the inconsistent one.
     *
     * Three limits keep it honest:
     *   - Only the SAVED value. The prediction beside it stays a chip to tap.
     *   - Only into an EMPTY pitch. Nothing already recorded is touched.
     *   - Only when a bhajan is PICKED, never on load, so opening a session does
     *     not quietly fill in ten pitches and leave the page dirty.
     * And it lands as an unsaved change like any other, visible in the save
     * summary before it becomes history.
     */
    const [b, saved] = await Promise.all([
      fetchBhajan(bhajanId),
      row?.singerId && !row.confirmedPitch ? savedListPitch(row.singerId, bhajanId) : null,
    ]);

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
          ...(saved && !r.confirmedPitch
            ? {
                confirmedPitch: saved,
                alternativeTablaPitch: props.suggestions.pitchToTabla[saved] ?? null,
              }
            : {}),
        };
      })
    );

    if (saved) setPitchUI((prev) => ({ ...prev, [localId]: { q: saved, open: false } }));
    setBhPortal((p) => ({ ...p, open: false }));
  }

  /**
   * The shruti this singer has SAVED for this bhajan on their own list, or null.
   *
   * Only `onList.preferredPitch` — not the suggestion, which folds in history and
   * a prediction. Those two are offered as a chip to tap and must stay that way;
   * this one is a decision already made.
   */
  async function savedListPitch(singerId: string, bhajanId: string): Promise<string | null> {
    try {
      const res = await fetch(
        `/api/pitch/suggest?singerId=${encodeURIComponent(singerId)}&bhajanId=${encodeURIComponent(bhajanId)}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const pitch: unknown = data?.onList?.preferredPitch;
      return typeof pitch === "string" && pitch.trim().length > 0 ? pitch : null;
    } catch {
      return null;
    }
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

  /** `then` runs only if the save actually went through — see the leave dialog. */
  function saveAll(then?: () => void) {
    if (!props.canEdit) return;

    const missingSinger = rows.some((r) => !r.singerId);
    if (missingSinger) {
      alert("Please select a singer for each row before saving.");
      return;
    }

    setSaveError(null);
    // What is being saved, as the unsaved-work tracking sees it. Taken before
    // the await so that editing during a save does not mark those later edits
    // as already saved.
    const snapshot = rows.map(toDraftRow);
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
        const res = await upsertSessionSingerRows(props.sessionId, payload);
        if (!res.ok) {
          setSaveError(res.error);
          return;
        }
        setSaveError(null);

        /*
         * Take the ids and timestamps the save just wrote.
         *
         * These rows live in local state, seeded once when the page loaded.
         * Without this the grid would keep sending the `updatedAt` values it
         * started with, and pressing Save twice would be refused the second
         * time as a concurrent edit — the grid clashing with its own writes.
         * A new row would keep its `new_…` id too, and save as a duplicate.
         *
         * If the counts disagree the mapping is not trustworthy, so fall back
         * to reloading rather than stamping rows with the wrong ids.
         */
        if (res.stamps.length === payload.length) {
          setRows((prev) =>
            prev.map((r, i) =>
              res.stamps[i] ? { ...r, id: res.stamps[i].id, updatedAt: res.stamps[i].updatedAt } : r,
            ),
          );
        } else {
          router.refresh();
        }

        // Saved work is no longer unsaved work: the comparison moves on, the
        // draft on the device goes, and whatever was waiting on the save (a
        // page the person was trying to leave for) may now happen.
        setBaseline(snapshot);
        forgetDraft();
        then?.();
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

  // A new set of results means the old highlight is meaningless.
  useEffect(() => {
    setBhActive(-1);
  }, [bhPortal.items, bhPortal.localId]);

  const portalEl =
    bhPortal.open && bhPortal.anchorRect
      ? createPortal(
          <div
            style={{
              position: "fixed",
              ...dropdownBox(bhPortal.anchorRect),
              zIndex: 9999,
            }}
            id="bhajan-suggestions"
            role="listbox"
            className="overflow-auto rounded-[12px] border border-rule-surface bg-panel shadow-xl"
          >
            {bhPortal.loading ? <div className="px-2 py-1.5 text-xs text-on-surface-muted">Searching…</div> : null}
            {bhPortal.items.length === 0 && !bhPortal.loading ? (
              <div className="px-2 py-1.5 text-xs text-on-surface-muted">No matches.</div>
            ) : null}
            {bhPortal.items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                ref={(el) => {
                  bhOptionRefs.current[i] = el;
                }}
                /* role=option so aria-selected means something: inside a
                   listbox a bare <button> announces nothing about which one
                   the arrow keys are on. */
                role="option"
                aria-selected={i === bhActive}
                className={[
                  "w-full px-3 py-2 text-left text-sm hover:bg-panel-hover",
                  i === bhActive ? "bg-panel-hover ring-1 ring-inset ring-brass/50" : "",
                ].join(" ")}
                onMouseEnter={() => setBhActive(i)}
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

      <LeaveWithChangesDialog
        open={leaveTo !== null}
        changes={changes}
        saving={isPending}
        onStay={() => setLeaveTo(null)}
        onDiscard={() => {
          const target = leaveTo;
          forgetDraft();
          // The edits go too — otherwise the draft is written again a moment
          // later from state that still holds them.
          setRows((prev) => {
            const wanted = new Map(baseline.map((r) => [r.id, r]));
            return prev
              .filter((r) => wanted.has(r._localId))
              .map((r) => {
                const b = wanted.get(r._localId)!;
                return {
                  ...r,
                  singerId: b.singerId,
                  bhajanId: b.bhajanId,
                  bhajanTitle: b.bhajanTitle,
                  festivalBhajanTitle: b.festivalBhajanTitle,
                  confirmedPitch: b.confirmedPitch,
                  alternativeTablaPitch: b.alternativeTablaPitch,
                  _bhajanQuery: b.bhajanTitle ?? b.festivalBhajanTitle ?? "",
                };
              });
          });
          if (target) leaveNow(target);
        }}
        onSave={() => {
          const target = leaveTo;
          saveAll(() => {
            if (target) leaveNow(target);
          });
        }}
      />

      {/*
        Work from last time, found on this device. Offered rather than applied:
        somebody may have moved on since, and having their session silently
        rewritten by a draft they had forgotten about would be worse than
        losing it.
      */}
      {offer ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-brass/40 bg-brass/[0.08] px-3 py-2 text-xs">
          <span>
            Unsaved changes from {ageLabel(offer.savedAt, Date.now())} are still on this device.
          </span>
          <button
            type="button"
            onClick={restoreDraft}
            className="font-semibold underline underline-offset-2"
          >
            Put them back
          </button>
          <button
            type="button"
            onClick={discardOffer}
            className="text-on-surface-muted underline underline-offset-2 hover:text-warn"
          >
            Discard
          </button>
        </div>
      ) : null}

      {heldBack.length > 0 ? (
        <div role="status" className="rounded-[12px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-xs">
          <p className="font-semibold">
            Somebody else had already saved {heldBack.length === 1 ? "this row" : "these rows"}, so
            the saved version was kept:
          </p>
          <ul className="mt-1 grid gap-0.5">
            {heldBack.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setHeldBack([])}
            className="mt-1 underline underline-offset-2 text-on-surface-muted"
          >
            Got it
          </button>
        </div>
      ) : null}

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
        {/*
          Saving belongs to anybody who may edit anything, not only to whoever
          may move singers around.

          This whole toolbar was gated on canAssign, so a member — who may
          change which bhajan is in a slot, and nothing else — could type a
          bhajan in and had no way at all to keep it. Their work vanished on
          the next page load with nothing on screen having suggested it would.
          Adding a row is still an assign-level act; saving is not.
        */}
        {props.canEdit || props.canAssign ? (
          <div className="flex items-center gap-2">
            {props.canAssign ? <Button onClick={addRow}>Add row</Button> : null}
            {/*
              The count is the cheapest guard of the lot: most work is lost by
              somebody who did not realise anything was outstanding, and a
              button that says "Save 3 changes" says so without stopping them.
              Note the arrow function — passing saveAll directly would hand it
              the click event as its `then` callback.
            */}
            <Button onClick={() => saveAll()} variant="primary">
              {isPending
                ? "Saving…"
                : dirty
                  ? `Save ${changes.length} change${changes.length === 1 ? "" : "s"}`
                  : "Save changes"}
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
              <th className="sticky left-0 z-20 w-[190px] border-r bg-panel px-3 py-2 text-left font-semibold shadow-sm">
                Singer
              </th>
              {/*
                Bhajan is NOT frozen, and must not be.

                It was sticky at left-[190px] while its body cells were ordinary
                cells, so the two came apart the moment the table scrolled: the
                header stopped at the singer column's edge and the bhajan names
                slid on underneath it, leaving the word "Bhajan" sitting over the
                pitch buttons. That is what a phone in landscape hits first —
                wide enough to miss the stacked-card breakpoint at 767px, too
                narrow for the table's 720px minimum not to scroll.

                Freezing the body cells too would fix the mismatch and cost more
                than it is worth: singer plus bhajan is around 300px of an 844px
                landscape screen held still, and bhajan is the column sized from
                whatever the others leave, so its sticky offset would be a
                guess. One frozen column — the singer, which is what a row is
                read by — is the whole of what this table needs.
              */}
              <th className="border-r bg-panel px-3 py-2 text-left font-semibold">Bhajan</th>
              <th className="w-[168px] px-2 py-1.5 text-left font-semibold">Pitch</th>
              {/* Wider than it was: the column now stacks a name and its row of
                  cushion dots per person, not one of each. */}
              <th className="w-[158px] px-2 py-1.5 text-left font-semibold">Chorus mics</th>
              <th className="w-[108px] whitespace-nowrap px-2 py-1.5 text-left font-semibold">
                Recommended
              </th>
              <th className="w-[52px] whitespace-nowrap px-2 py-1.5 text-left font-semibold">
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
                    className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-1.5 border-r border-rule-surface shadow-sm"
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
                        onKeyDown={onBhajanKeyDown(r._localId)}
                        role="combobox"
                        aria-expanded={bhPortal.open && bhPortal.localId === r._localId}
                        aria-controls="bhajan-suggestions"
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
                  <td data-label="Pitch" data-key="1" className="px-2 py-1.5">
                    {props.canEdit ? (
                      /* Both wrappers constrained: the inner one was w-full of
                         an outer that sized to its content, so the input still
                         overhung the column by the cell's own padding. */
                      <div className="relative w-full min-w-0">
                        {/* w-full, not w-fit with size={16}: a fixed-layout
                            column gives the cell its width, and anything that
                            insists on its own spills over the next column. */}
                        <div className="relative w-full">
                        <input
                          type="text"
                          value={pu.q}
                          placeholder="Pitch"
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
                          /* w-full, not w-[20ch]: 20 characters is wider than the column
                             and was the last 8px of overhang into Recommended. */
                          className={`w-full min-w-0 rounded-[10px] border-2 border-brass/45 bg-field py-1.5 pl-2 text-[14px] font-semibold leading-5 ${pu.q ? "pr-7" : "pr-2"}`}
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

                          {/*
                            What they have sung it at, or asked for on their
                            list. Only shown when it differs from what is
                            already in the field — a chip offering the value
                            you can see is just clutter.
                          */}

                        </div>

                        {/*
                          The suggestion sits on its own line under the
                          controls rather than beside them. In the column it
                          shares with the field, the minus, the plus and
                          "= rec", it had nowhere to go but onto a second line
                          mid-chip, which is what made the cell look broken.
                        */}
                        {(() => {
                          const hint =
                            r.singerId && r.bhajanId
                              ? pitchHint[hintKey(r.singerId, r.bhajanId)]
                              : null;
                          if (!hint || hint.pitch === r.confirmedPitch) return null;

                          const guessed = hint.source === "predicted";
                          return (
                            <button
                              type="button"
                              onClick={() => pickPitch(r._localId, hint.pitch)}
                              title={
                                guessed
                                  ? `${hint.pitch} — predicted from their own offset. They have not sung this one.`
                                  : hint.source === "list"
                                    ? `${hint.pitch} — the shruti saved for them on their list`
                                    : `${hint.pitch} — sung ${hint.times}\u00d7${hint.lastOn ? `, last ${hint.lastOn}` : ""}`
                              }
                              className={[
                                /* min-height rather than a fixed one, and a
                                   tight leading: the column is 168px and a
                                   long shruti plus a word will sometimes need
                                   two lines rather than being clipped into
                                   one. */
                                "mt-1 inline-flex min-h-6 w-full flex-wrap items-center justify-center gap-x-1.5 rounded-[8px] border px-1.5 py-0.5 text-[11px] leading-tight",
                                guessed
                                  ? // Quieter, and dashed: a guess, not a record.
                                    "border-dashed border-rule-surface bg-field text-on-surface-muted hover:border-brass/50 hover:text-on-surface"
                                  : "border-brass/45 bg-brass/[0.08] text-on-surface hover:border-brass",
                              ].join(" ")}
                            >
                              <span className="font-mono">{hint.pitch}</span>
                              <span className={guessed ? "" : "text-on-surface-muted"}>
                                {guessed
                                  ? "predicted"
                                  : hint.source === "list"
                                    ? "saved"
                                    : `sung${hint.times > 1 ? ` ${hint.times}\u00d7` : ""}`}
                              </span>
                            </button>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="whitespace-nowrap text-[14px] font-semibold">{r.confirmedPitch ?? "—"}</div>
                    )}
                  </td>

                  {/* Chorus mics — written by the cell itself, not by the save. */}
                  <td data-label="Chorus mics" className="px-2 py-1.5 align-top">
                    <ChorusCell
                      slotId={r.id ?? null}
                      singers={props.singers}
                      mics={r.chorus ?? []}
                      canAssign={props.canAssign}
                      canSetCushion={props.canSetMicCushion}
                    />
                  </td>

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