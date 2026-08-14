"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { sectionsFor, type SectionStyle } from "@/lib/songVerses";
import { addVerse, moveVerse, pasteVerses, removeVerse, updateVerse } from "@/app/songs/actions";
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
  const [style, setStyle] = useState<SectionStyle>("carnatic");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pasting, setPasting] = useState(false);

  if (!canEdit) return null;

  const say = (res: { ok: boolean; error?: string }, good: string) =>
    setMessage(res.ok ? { ok: true, text: good } : { ok: false, text: res.error ?? "Failed." });

  return (
    <div className="grid gap-4 border-t border-rule-surface pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-on-surface-muted">Add a section</span>
        <select
          value={style}
          aria-label="Which kind of song"
          className="h-8 rounded-key border border-rule-surface bg-field px-2 text-xs"
          onChange={(e) => setStyle(e.target.value as SectionStyle)}
        >
          <option value="carnatic">Carnatic</option>
          <option value="western">Western</option>
        </select>
        {sectionsFor(style).map((section) => (
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
 * Paste a document in.
 *
 * Splits on blank lines, one verse per block, and lifts a shouted heading —
 * PALLAVI, CARAṆAM 1 — onto the verse rather than leaving it as a first line.
 * Appends, so pasting the transliteration and then the meanings does not wipe
 * the first paste.
 */
function PasteBox({
  songId,
  onMessage,
}: {
  songId: string;
  onMessage: (m: { ok: boolean; text: string } | null) => void;
}) {
  const [layer, setLayer] = useState<"script" | "roman" | "meaning">("roman");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-2 rounded-[12px] border border-dashed border-rule-surface p-3">
      <p className="text-xs text-on-surface-muted">
        One verse per blank line. A heading on its own line — PALLAVI, Charanam 1 — becomes the
        section. This ADDS verses; it never replaces what is already here.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-on-surface-muted">This text is the</span>
        <select
          value={layer}
          aria-label="Which layer is being pasted"
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
        onClick={() =>
          startTransition(async () => {
            const res = await pasteVerses({ songId, layer, text });
            if (res.ok) {
              onMessage({ ok: true, text: `Added ${res.added} verse${res.added === 1 ? "" : "s"}.` });
              setText("");
            } else onMessage({ ok: false, text: res.error });
          })
        }
      >
        Add these verses
      </Button>
    </div>
  );
}
