"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import {
  sectionsFor,
  splitPastedLayers,
  splitPastedVerses,
  type PastedVerse,
} from "@/lib/songVerses";

/**
 * The section families, named by what they contain rather than by the tradition
 * they come from — "Western" told you nothing about where Chorus lived.
 */
const SECTION_GROUPS = [
  { label: "Pallavi / charanam", sections: sectionsFor("carnatic") },
  { label: "Verse / chorus", sections: sectionsFor("western") },
] as const;
import {
  addPastedVerses,
  addVerse,
  moveVerse,
  removeVerse,
  updateVerse,
} from "@/app/songs/actions";
import type { VerseView } from "./Verses";

/**
 * Editing the words.
 *
 * One verse at a time, three boxes each. The section buttons across the top add
 * a labelled verse in one press — Pallavi, Anupallavi, Charanam for a kriti;
 * Verse, Chorus, Bridge, Refrain for anything built the Western way — and the
 * numbering is worked out on the server so two people adding a Charanam at once
 * cannot both get the same number.
 *
 * The paste box is the one that will actually get used: every song here starts
 * life in a Google Doc, and pasting the transliteration, then the meanings,
 * beats typing twelve verses by hand.
 */
export function VerseEditor({
  songId,
  verses,
  canEdit,
}: {
  songId: string;
  verses: VerseView[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pasting, setPasting] = useState(false);

  if (!canEdit) return null;

  const say = (res: { ok: boolean; error?: string }, good: string) =>
    setMessage(res.ok ? { ok: true, text: good } : { ok: false, text: res.error ?? "Failed." });

  return (
    <div className="grid gap-4 border-t border-rule-surface pt-4">
      {/*
        BOTH families of section, shown at once.

        This was a dropdown — "Carnatic" or "Western" — defaulting to Carnatic,
        so Verse and Chorus existed and were invisible unless you happened to
        change a control that named a musical tradition rather than the sections
        inside it. Sailavan asked for "another category of song with verse and
        chorus"; it was already there, behind that.

        Seven buttons is not a lot, and a mode that hides half of them to save
        four is a bad trade — especially when a programme can hold both kinds of
        song and somebody would otherwise be flicking the selector back and forth
        between two items.
      */}
      <div className="grid gap-1.5">
        <span className="text-xs uppercase tracking-wide text-on-surface-muted">
          Add a section
        </span>

        {SECTION_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-[11px] text-on-surface-muted">{group.label}</span>
            {group.sections.map((section) => (
              <Button
                key={section}
                type="button"
                className="h-8 text-xs"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await addVerse({ songId, section });
                    say(res, `Added a ${section.toLowerCase()}.`);
                  })
                }
              >
                {section}
              </Button>
            ))}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 text-[11px] text-on-surface-muted">No heading</span>
          <Button
            type="button"
            className="h-8 text-xs"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await addVerse({ songId, section: "" });
                say(res, "Added a verse.");
              })
            }
          >
            Unlabelled
          </Button>
        </div>
      </div>

      <ol className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {verses.map((verse, index) => (
          <li key={verse.id} className="min-w-0">
            <VerseRow
              verse={verse}
              isFirst={index === 0}
              isLast={index === verses.length - 1}
              onMessage={setMessage}
            />
          </li>
        ))}
      </ol>

      <div className="grid gap-2">
        <button
          type="button"
          className="justify-self-start text-xs text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
          onClick={() => setPasting((p) => !p)}
        >
          {pasting ? "Never mind" : "Paste a whole song from a document"}
        </button>
        {pasting ? <PasteBox songId={songId} onMessage={setMessage} /> : null}
      </div>

      {message ? (
        <p role="status" className={message.ok ? "text-xs text-brass-ink" : "text-xs text-warn"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function VerseRow({
  verse,
  isFirst,
  isLast,
  onMessage,
}: {
  verse: VerseView;
  isFirst: boolean;
  isLast: boolean;
  onMessage: (m: { ok: boolean; text: string } | null) => void;
}) {
  const [draft, setDraft] = useState({
    label: verse.label ?? "",
    script: verse.script ?? "",
    roman: verse.roman ?? "",
    meaning: verse.meaning ?? "",
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const box =
    "w-full rounded-key border border-rule-surface bg-field p-2 text-sm leading-relaxed text-on-surface";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-[12px] border border-rule-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={draft.label}
          aria-label="Section"
          placeholder="Section, e.g. Charanam 2"
          className="h-8 w-48"
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Move verse up"
            disabled={pending || isFirst}
            className="rounded border border-rule-surface px-1.5 text-xs text-on-surface-muted hover:text-on-surface disabled:opacity-30"
            onClick={() =>
              startTransition(async () => {
                await moveVerse({ id: verse.id, direction: "up" });
              })
            }
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move verse down"
            disabled={pending || isLast}
            className="rounded border border-rule-surface px-1.5 text-xs text-on-surface-muted hover:text-on-surface disabled:opacity-30"
            onClick={() =>
              startTransition(async () => {
                await moveVerse({ id: verse.id, direction: "down" });
              })
            }
          >
            ↓
          </button>
        </span>
      </div>

      <label className="grid gap-1 text-xs text-on-surface-muted">
        Script — as it is written
        <textarea
          value={draft.script}
          rows={3}
          dir="auto"
          className={`${box} font-display`}
          onChange={(e) => setDraft({ ...draft, script: e.target.value })}
        />
      </label>
      <label className="grid gap-1 text-xs text-on-surface-muted">
        Transliteration — what most people sing from
        <textarea
          value={draft.roman}
          rows={3}
          className={box}
          onChange={(e) => setDraft({ ...draft, roman: e.target.value })}
        />
      </label>
      <label className="grid gap-1 text-xs text-on-surface-muted">
        Meaning — one line each to align them line by line, or a block for the whole verse
        <textarea
          value={draft.meaning}
          rows={3}
          className={`${box} italic`}
          onChange={(e) => setDraft({ ...draft, meaning: e.target.value })}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          className="h-8 text-xs"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await updateVerse({ id: verse.id, ...draft });
              if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
                onMessage(null);
              } else onMessage({ ok: false, text: res.error });
            })
          }
        >
          Save
        </Button>
        {saved ? <span className="text-xs text-brass-ink">Saved.</span> : null}
        <Button
          type="button"
          variant="danger"
          className="ml-auto h-8 text-xs"
          disabled={pending}
          onClick={() => {
            if (!confirm("Remove this verse?")) return;
            startTransition(async () => {
              const res = await removeVerse({ id: verse.id });
              if (!res.ok) onMessage({ ok: false, text: res.error });
            });
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

/**
 * Paste a document in — read it first, then agree with it.
 *
 * The documents interleave the three layers line by line, so pasting used to
 * mean doing it three times and picking out every third line by hand. It now
 * reads the whole thing at once (see lib/songVerses.ts `splitPastedLayers`).
 *
 * But it PROPOSES rather than writes. Sailavan: "the paste verses may not
 * always be exactly the same, so it should send it through to the person after
 * processing it so they can review and reassign as necessary." A parser that
 * guesses and commits is only as good as its worst guess, and a wrong guess
 * written straight into the words of a song is worse than no parser — you have
 * to find it before you can fix it. So what it made of the document is laid out
 * line by line, in the three columns it will be stored as, and nothing is
 * written until somebody says so.
 *
 * The parse happens in the browser, because it is a pure function and there is
 * nothing to ask a server about.
 */
function PasteBox({
  songId,
  onMessage,
}: {
  songId: string;
  onMessage: (m: { ok: boolean; text: string } | null) => void;
}) {
  const [text, setText] = useState("");
  const [layer, setLayer] = useState<"script" | "roman" | "meaning">("roman");
  const [draft, setDraft] = useState<DraftVerse[] | null>(null);
  const [guessed, setGuessed] = useState(true);
  const [pending, startTransition] = useTransition();

  function read() {
    const auto = splitPastedLayers(text);
    if (auto) {
      setDraft(auto.map(toDraft));
      setGuessed(true);
      return;
    }
    /*
     * Not the interleaved shape — no non-Latin line to key on. Rather than
     * guess which of two Latin lines is the transliteration and which is the
     * meaning, fall back to the old behaviour and ask: one layer, chosen here.
     */
    const blocks = splitPastedVerses(text);
    if (blocks.length === 0) {
      onMessage({ ok: false, text: "There was nothing to read." });
      return;
    }
    setDraft(
      blocks.map((b) =>
        toDraft({
          label: b.label,
          script: layer === "script" ? b.body : "",
          roman: layer === "roman" ? b.body : "",
          meaning: layer === "meaning" ? b.body : "",
        }),
      ),
    );
    setGuessed(false);
  }

  if (draft) {
    const lineCount = draft.reduce((n, v) => n + v.lines.length, 0);
    return (
      <div className="grid gap-3 rounded-[12px] border border-dashed border-rule-surface p-3">
        <p className="text-xs text-on-surface-muted">
          {guessed
            ? `Read as ${draft.length} verse${draft.length === 1 ? "" : "s"}, ${lineCount} line${lineCount === 1 ? "" : "s"}. Check the columns before adding — anything can be edited here, and nothing is saved yet.`
            : `No script line to key on, so this went in as the ${layer}. ${draft.length} verse${draft.length === 1 ? "" : "s"}.`}
        </p>

        <ol className="grid gap-3">
          {draft.map((verse, vi) => (
            <li key={vi} className="grid gap-1.5 rounded-[10px] border border-rule-surface p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={verse.label}
                  aria-label={`Section for verse ${vi + 1}`}
                  placeholder="Pallavi, Charanam, Chorus…"
                  className="h-8 w-44 text-xs"
                  onChange={(e) =>
                    setDraft(edit(draft, vi, (v) => ({ ...v, label: e.target.value })))
                  }
                />
                <button
                  type="button"
                  className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-warn"
                  onClick={() => setDraft(draft.filter((_, i) => i !== vi))}
                >
                  drop this verse
                </button>
              </div>

              {/* One row per line of the song, in the three columns it is stored
                  as — so a line in the wrong column is visible at a glance and
                  fixed by typing, which is what "reassign" needs to mean. */}
              <div className="hidden gap-1 text-[10px] uppercase tracking-wide text-on-surface-muted sm:grid sm:grid-cols-[1fr_1fr_1fr_auto]">
                <span>Script</span>
                <span>Transliteration</span>
                <span>Meaning</span>
                <span />
              </div>

              {verse.lines.map((line, li) => (
                <div key={li} className="grid gap-1 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  {(["script", "roman", "meaning"] as const).map((key) => (
                    <Input
                      key={key}
                      dir="auto"
                      value={line[key]}
                      aria-label={`${key} of line ${li + 1}, verse ${vi + 1}`}
                      placeholder={key}
                      className="h-8 text-xs"
                      onChange={(e) =>
                        setDraft(
                          edit(draft, vi, (v) => ({
                            ...v,
                            lines: v.lines.map((l, i) =>
                              i === li ? { ...l, [key]: e.target.value } : l,
                            ),
                          })),
                        )
                      }
                    />
                  ))}
                  <button
                    type="button"
                    aria-label={`Remove line ${li + 1} of verse ${vi + 1}`}
                    className="justify-self-end px-1 text-xs text-on-surface-muted hover:text-warn"
                    onClick={() =>
                      setDraft(
                        edit(draft, vi, (v) => ({
                          ...v,
                          lines: v.lines.filter((_, i) => i !== li),
                        })),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="justify-self-start text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                onClick={() =>
                  setDraft(
                    edit(draft, vi, (v) => ({
                      ...v,
                      lines: [...v.lines, { script: "", roman: "", meaning: "" }],
                    })),
                  )
                }
              >
                add a line
              </button>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            className="h-8 text-xs"
            disabled={pending || draft.length === 0}
            onClick={() =>
              startTransition(async () => {
                const res = await addPastedVerses({ songId, verses: draft.map(fromDraft) });
                if (res.ok) {
                  onMessage({
                    ok: true,
                    text: `Added ${res.added} verse${res.added === 1 ? "" : "s"}.`,
                  });
                  setDraft(null);
                  setText("");
                } else onMessage({ ok: false, text: res.error });
              })
            }
          >
            Add {draft.length} verse{draft.length === 1 ? "" : "s"}
          </Button>
          <button
            type="button"
            className="text-[11px] text-on-surface-muted underline underline-offset-2"
            onClick={() => setDraft(null)}
          >
            back to the text
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-[12px] border border-dashed border-rule-surface p-3">
      <p className="text-xs text-on-surface-muted">
        Paste the whole song, however the document has it — script, transliteration and meaning
        line by line is read as all three at once. One verse per blank line; a heading on its own
        line becomes the section. You get to check it before anything is saved, and this always
        ADDS to what is already here.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-on-surface-muted">
          If there is no script to go by, treat it as the
        </span>
        <select
          value={layer}
          aria-label="Which layer plain text should be treated as"
          className="h-8 rounded-key border border-rule-surface bg-field px-2 text-xs"
          onChange={(e) => setLayer(e.target.value as "script" | "roman" | "meaning")}
        >
          <option value="roman">transliteration</option>
          <option value="script">script</option>
          <option value="meaning">meaning</option>
        </select>
      </div>
      <textarea
        value={text}
        rows={8}
        dir="auto"
        className="w-full rounded-key border border-rule-surface bg-field p-2 text-sm leading-relaxed text-on-surface"
        placeholder="Paste from the document here."
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        type="button"
        variant="primary"
        className="h-8 justify-self-start text-xs"
        disabled={pending || text.trim().length === 0}
        onClick={read}
      >
        Read it
      </Button>
    </div>
  );
}

/** A verse while it is being reviewed: lines, so the columns can be seen to line up. */
type DraftVerse = {
  label: string;
  lines: { script: string; roman: string; meaning: string }[];
};

function toDraft(v: PastedVerse): DraftVerse {
  const script = v.script.split("\n");
  const roman = v.roman.split("\n");
  const meaning = v.meaning.split("\n");
  const rows = Math.max(script.length, roman.length, meaning.length);

  return {
    label: v.label ?? "",
    lines: Array.from({ length: rows }, (_, i) => ({
      script: script[i] ?? "",
      roman: roman[i] ?? "",
      meaning: meaning[i] ?? "",
    })),
  };
}

function fromDraft(v: DraftVerse): PastedVerse {
  const column = (key: "script" | "roman" | "meaning") => {
    const lines = v.lines.map((l) => l[key]);
    // All blank means the layer is absent, not a stack of empty lines.
    return lines.some((l) => l.trim().length > 0) ? lines.join("\n") : "";
  };
  return {
    label: v.label.trim() || null,
    script: column("script"),
    roman: column("roman"),
    meaning: column("meaning"),
  };
}

function edit(draft: DraftVerse[], index: number, change: (v: DraftVerse) => DraftVerse) {
  return draft.map((v, i) => (i === index ? change(v) : v));
}
