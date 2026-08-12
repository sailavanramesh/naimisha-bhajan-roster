"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { addToList, upsertLearning } from "@/app/my-list/actions";
import { RepertoireKind } from "@prisma/client";

type Hit = { id: string; title: string };

type Insight = {
  onList: { kind: string; preferredPitch: string | null } | null;
  sung: { times: number; lastOn: string | null };
  suggestion: { pitch: string | null; source: string; conflicted: boolean };
};

const STAGE_WORDS: Record<string, string> = {
  known: "you already know it",
  learning: "you are already learning it",
  wantToLearn: "it is already on your want-to-learn list",
  festival: "you already know it",
};

/** Where a suggested pitch came from, in words. */
const SOURCE_WORDS: Record<string, string> = {
  list: "the pitch on your list",
  sung: "what you have sung it at",
  predicted: "your usual offset",
  reference: "the masterlist reference",
  none: "",
};

function kindLabel(kind: string): string {
  return kind === "known" ? "Know it" : kind === "learning" ? "Learning" : "Want to learn";
}

/**
 * Adding a bhajan to somebody's list.
 *
 * It was a bare text box that matched the masterlist on an EXACT title when
 * saved. Sailavan: "shouldn't this allow me to search and select the bhajan
 * and then have an option to list a bhajan that's not on the masterlist if i
 * want?" — which is exactly right, and is what the roster grid has always
 * done. Typing "raghava rama" and getting a free-text row that links nowhere,
 * with no hint that the real bhajan was one keystroke away, is the worst of
 * both.
 *
 * So: search as you type, arrow keys and Enter to take one, and an explicit
 * offer to save what you typed as free text when nothing fits. The free-text
 * route stays — ten roster titles have never resolved to the masterlist and
 * dropping them would lose real data — but it is now a choice rather than the
 * silent consequence of a typo.
 *
 * Picking one then answers two more questions, both from the same round trip:
 * whether it is already on their list, and what pitch they would sing it at.
 * The second is the app's own suggestion — their list, then what they have
 * sung, then their median offset against the reference — which until now only
 * the assign panel could see.
 */
export function AddToListForm({ singerId }: { singerId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Hit | null>(null);
  const [kind, setKind] = useState("wantToLearn");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [refused, setRefused] = useState<{
    label: string;
    title: string;
    preferredPitch: string | null;
  } | null>(null);
  /** They have sung it, and are filing it under something less than "know it". */
  const [sung, setSung] = useState<{
    title: string;
    times: number;
    lastOn: string | null;
    pitch: string | null;
  } | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [keepPitch, setKeepPitch] = useState(true);
  const seq = useRef(0);

  // Search as you type. The endpoint is the same one the roster grid uses, so
  // the two agree about what counts as a match.
  useEffect(() => {
    const q = query.trim();
    if (picked || q.length < 2) {
      setHits([]);
      return;
    }
    const mine = ++seq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/bhajans/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        // Ignore a slow answer to an older keystroke.
        if (mine !== seq.current) return;
        setHits(Array.isArray(data?.items) ? data.items.slice(0, 8) : []);
        setOpen(true);
        setActive(-1);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, picked]);

  const choose = (hit: Hit) => {
    setPicked(hit);
    setQuery(hit.title);
    setOpen(false);
    setMessage(null);
    setInsight(null);

    // Is it already theirs, and what would they sing it at?
    const mine = ++seq.current;
    void (async () => {
      try {
        const res = await fetch(
          `/api/pitch/suggest?singerId=${encodeURIComponent(singerId)}&bhajanId=${encodeURIComponent(hit.id)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (mine !== seq.current) return;
        setInsight({ onList: data.onList, sung: data.sung, suggestion: data.suggestion });
        // If they already know it at a pitch, do not offer to overwrite it.
        setKeepPitch(!data.onList?.preferredPitch);
      } catch {
        // A missing suggestion is not worth an error; adding still works.
      }
    })();
  };

  const submit = (title: string, opts: { force?: boolean; asKind?: string } = {}) =>
    startTransition(async () => {
      setMessage(null);
      setRefused(null);
      setSung(null);
      const res = await addToList({
        singerId,
        title,
        kind: (opts.asKind ?? kind) as RepertoireKind,
        // Only ever a suggestion the person accepted, never applied silently.
        preferredPitch: keepPitch && insight?.suggestion.pitch ? insight.suggestion.pitch : "",
        force: opts.force,
      });

      if (!res.ok) {
        if ("already" in res) {
          // Already theirs. Say so and stop — moving it is a separate act.
          setRefused(res.already);
        } else if ("sung" in res) {
          // The roster knows it even though the list does not.
          setSung(res.sung);
        } else {
          setMessage(res.error);
        }
        return;
      }

      setQuery("");
      setPicked(null);
      setHits([]);
      setInsight(null);
      setOpen(false);
      setMessage(`Added ${res.title}.`);
      router.refresh();
    });

  /** The explicit second act: move it, having been told where it already is. */
  const moveAnyway = (title: string) =>
    startTransition(async () => {
      const form = new FormData();
      form.set("singerId", singerId);
      form.set("title", title);
      form.set("kind", kind);
      form.set("note", "");
      form.set("preferredPitch", "");
      await upsertLearning(form);
      setRefused(null);
      setQuery("");
      setPicked(null);
      setInsight(null);
      setMessage(`Moved ${title} to ${kindLabel(kind)}.`);
      router.refresh();
    });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((prev) => (prev < 0 ? (step === 1 ? 0 : hits.length - 1) : (prev + step + hits.length) % hits.length));
      return;
    }
    if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(hits[active]);
      return;
    }
    if (e.key === "Escape") setOpen(false);
  };

  const typed = query.trim();
  const exact = hits.find((h) => h.title.toLowerCase() === typed.toLowerCase());

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
              setMessage(null);
              setRefused(null);
              setSung(null);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => hits.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search the masterlist…"
            aria-label="Bhajan title"
            role="combobox"
            aria-expanded={open}
            aria-controls="add-to-list-suggestions"
            className="h-11 w-full rounded-[10px] border border-rule-surface bg-field px-3 text-sm text-on-surface"
          />

          {open && hits.length > 0 ? (
            <ul
              id="add-to-list-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-[12px] border border-rule-surface bg-panel shadow-xl"
            >
              {hits.map((h, i) => (
                <li key={h.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(h)}
                    className={[
                      "w-full px-3 py-2 text-left text-sm hover:bg-panel-hover",
                      i === active ? "bg-panel-hover ring-1 ring-inset ring-brass/50" : "",
                    ].join(" ")}
                  >
                    {h.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Status"
          className="h-11 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
        >
          <option value="wantToLearn">Want to learn</option>
          <option value="learning">Learning</option>
          <option value="known">Know it</option>
        </select>

        <Button
          type="button"
          variant="primary"
          className="h-11"
          disabled={pending || typed.length === 0}
          onClick={() => submit(picked?.title ?? typed)}
        >
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>

      {sung ? (
        <p className="grid gap-2 rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-xs">
          <span>
            Not added as <strong>{kindLabel(kind)}</strong> — you have sung{" "}
            <strong>{sung.title}</strong> {sung.times}
            {"\u00d7"}
            {sung.lastOn ? `, last on ${sung.lastOn}` : ""}
            {sung.pitch ? ` at ${sung.pitch}` : ""}.
          </span>
          <span className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => submit(sung.title, { asKind: "known", force: true })}
              className="underline underline-offset-2 hover:text-on-surface"
            >
              Add it to Know it
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => submit(sung.title, { force: true })}
              className="text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
            >
              No, {kindLabel(kind).toLowerCase()} is right
            </button>
          </span>
        </p>
      ) : null}

      {refused ? (
        <p className="grid gap-2 rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-xs">
          <span>
            Not added — <strong>{refused.title}</strong> is already on this list under{" "}
            <strong>{refused.label}</strong>
            {refused.preferredPitch ? ` at ${refused.preferredPitch}` : ""}.
          </span>
          {refused.label !== kindLabel(kind) ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => moveAnyway(refused.title)}
              className="justify-self-start underline underline-offset-2 hover:text-on-surface"
            >
              Move it to {kindLabel(kind)} instead
            </button>
          ) : null}
        </p>
      ) : null}

      {picked && insight?.onList ? (
        <p className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-xs">
          <strong>{picked.title}</strong> is already on this list —{" "}
          {STAGE_WORDS[insight.onList.kind] ?? "it is already there"}
          {insight.onList.preferredPitch ? ` at ${insight.onList.preferredPitch}` : ""}. Adding
          again just moves it to <strong>{kindLabel(kind)}</strong>.
        </p>
      ) : null}

      {picked && insight?.suggestion.pitch ? (
        <label className="flex flex-wrap items-center gap-2 text-xs text-on-surface-muted">
          <input
            type="checkbox"
            checked={keepPitch}
            onChange={(e) => setKeepPitch(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <span>
            Save the shruti as{" "}
            <strong className="font-mono text-on-surface">{insight.suggestion.pitch}</strong> —
            from {SOURCE_WORDS[insight.suggestion.source] || "the reference"}
            {insight.sung.times > 0
              ? `, sung ${insight.sung.times}\u00d7${insight.sung.lastOn ? `, last ${insight.sung.lastOn}` : ""}`
              : ""}
            {insight.suggestion.conflicted ? " (the lower of two)" : ""}
          </span>
        </label>
      ) : null}

      <p className="text-xs text-on-surface-muted">
        {picked ? (
          <>
            Adding <strong>{picked.title}</strong> from the masterlist.
          </>
        ) : searching ? (
          "Searching…"
        ) : typed.length >= 2 && hits.length === 0 ? (
          /* Nothing matched: say so, and make saving it anyway deliberate. */
          <>
            Nothing in the masterlist matches &ldquo;{typed}&rdquo;. Add will save it as a
            plain title — kept on the list, but it will not link to a bhajan page.
          </>
        ) : typed.length >= 2 && !exact ? (
          "Pick one from the list, or press Add to save exactly what you typed."
        ) : (
          "Start typing to search the masterlist."
        )}
      </p>

      {message ? (
        <p role="status" className="text-xs text-brass-ink">
          {message}
        </p>
      ) : null}
    </div>
  );
}
