"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, CardContent, FieldLabel, Input, Textarea } from "@/components/ui";
import { GuideBody } from "./GuideBody";
import {
  addGuideSection,
  moveGuideSection,
  removeGuideSection,
  restoreGuideSection,
  saveGuideSection,
} from "./actions";

export type EditableSection = {
  id: string;
  key: string;
  title: string;
  href: string | null;
  blurb: string | null;
  body: string;
  coordinatorOnly: boolean;
  hidden: boolean;
  /** Is there text in lib/defaultGuide.ts to put this card back to? */
  hasOriginal: boolean;
};

/**
 * Editing the guide, in place.
 *
 * Sailavan asked to be able to make "manual changes … and updated for everyone
 * without it having to go via Claude Code and this process", which is the whole
 * design brief: the page you read and the page you edit are the same page, and
 * a save is live for the group immediately.
 *
 * OFF BY DEFAULT. The owner opens /guide the way everybody else does and sees
 * what they see; editing is a toggle, because the common reason an owner is on
 * this page is to read it or to send somebody the link.
 *
 * Only owners get here at all — `editGuide`, checked again inside every action.
 */
export function GuideEditor({ sections }: { sections: EditableSection[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await work();
      if (!res.ok) setError(res.error ?? "That did not save.");
    });

  if (!editing) {
    return (
      <div className="no-print flex justify-end">
        <Button type="button" className="h-8 text-xs" onClick={() => setEditing(true)}>
          Edit this page
        </Button>
      </div>
    );
  }

  return (
    <div className="no-print grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-on-surface-muted">
          Editing. Every save is live for the group straight away.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="h-8 text-xs"
            disabled={pending}
            onClick={() => run(() => addGuideSection())}
          >
            Add a section
          </Button>
          <Button
            type="button"
            variant="primary"
            className="h-8 text-xs"
            onClick={() => setEditing(false)}
          >
            Done
          </Button>
        </div>
      </div>

      {error ? (
        <p role="status" className="text-sm text-warn">
          {error}
        </p>
      ) : null}

      {sections.map((section, i) => (
        <SectionEditor
          key={section.id}
          section={section}
          isFirst={i === 0}
          isLast={i === sections.length - 1}
          onError={setError}
        />
      ))}

      <p className="text-xs text-on-surface-muted">
        In the text: a blank line starts a new paragraph, a line beginning{" "}
        <code className="font-mono">-</code> is a bullet, a line beginning{" "}
        <code className="font-mono">&gt;</code> is the quiet grey line at the foot of a card.{" "}
        <code className="font-mono">**bold**</code>, <code className="font-mono">_italic_</code>,
        and <code className="font-mono">[words](/roster)</code> for a link.
      </p>
    </div>
  );
}

function SectionEditor({
  section,
  isFirst,
  isLast,
  onError,
}: {
  section: EditableSection;
  isFirst: boolean;
  isLast: boolean;
  onError: (m: string | null) => void;
}) {
  const [draft, setDraft] = useState({
    title: section.title,
    href: section.href ?? "",
    blurb: section.blurb ?? "",
    body: section.body,
    coordinatorOnly: section.coordinatorOnly,
    hidden: section.hidden,
  });
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      onError(null);
      const res = await work();
      if (!res.ok) onError(res.error ?? "That did not save.");
    });

  const save = () =>
    startTransition(async () => {
      onError(null);
      const res = await saveGuideSection({ id: section.id, ...draft });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else onError(res.error);
    });

  return (
    <Card>
      <CardContent className="grid gap-3 py-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1">
            <FieldLabel>Title</FieldLabel>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="grid gap-1">
            <FieldLabel>Links to (optional)</FieldLabel>
            <Input
              value={draft.href}
              placeholder="/roster"
              onChange={(e) => setDraft({ ...draft, href: e.target.value })}
            />
          </label>
        </div>

        <label className="grid gap-1">
          <FieldLabel>One line under the title (optional)</FieldLabel>
          <Input value={draft.blurb} onChange={(e) => setDraft({ ...draft, blurb: e.target.value })} />
        </label>

        <label className="grid gap-1">
          <FieldLabel>The text</FieldLabel>
          <Textarea
            value={draft.body}
            rows={10}
            className="font-mono text-xs"
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        </label>

        {/*
          THE PREVIEW IS THE SAME COMPONENT THE PAGE USES.

          Not a second renderer that agrees most of the time — GuideBody, with
          the draft passed straight in. Somebody writing a bullet list should see
          the bullets before they save, and see them exactly as the group will.
        */}
        <div className="grid gap-2 rounded-[10px] border border-rule-surface bg-panel p-3 text-sm">
          <p className="text-[11px] uppercase tracking-wide text-on-surface-muted">As it reads</p>
          <GuideBody body={draft.body} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-on-surface-muted">
            <input
              type="checkbox"
              checked={draft.coordinatorOnly}
              className="h-3.5 w-3.5"
              onChange={(e) => setDraft({ ...draft, coordinatorOnly: e.target.checked })}
            />
            coordinators only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-on-surface-muted">
            <input
              type="checkbox"
              checked={draft.hidden}
              className="h-3.5 w-3.5"
              onChange={(e) => setDraft({ ...draft, hidden: e.target.checked })}
            />
            hidden
          </label>

          <span className="ms-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label={`Move ${section.title} up`}
              disabled={pending || isFirst}
              className="rounded border border-rule-surface px-1.5 text-xs text-on-surface-muted hover:text-on-surface disabled:opacity-30"
              onClick={() => run(() => moveGuideSection({ id: section.id, direction: "up" }))}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${section.title} down`}
              disabled={pending || isLast}
              className="rounded border border-rule-surface px-1.5 text-xs text-on-surface-muted hover:text-on-surface disabled:opacity-30"
              onClick={() => run(() => moveGuideSection({ id: section.id, direction: "down" }))}
            >
              ↓
            </button>

            {/*
              Restoring reads the words out of lib/defaultGuide.ts, so an edit
              that went wrong is one press to undo. A card added here has no
              original, and is offered a delete instead.
            */}
            {section.hasOriginal ? (
              <button
                type="button"
                disabled={pending}
                className="text-xs text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                onClick={() => run(() => restoreGuideSection({ id: section.id }))}
              >
                restore the original text
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                className="text-xs text-on-surface-muted underline underline-offset-2 hover:text-warn"
                onClick={() => {
                  if (!confirm(`Delete “${section.title}”?`)) return;
                  run(() => removeGuideSection({ id: section.id }));
                }}
              >
                delete
              </button>
            )}

            {saved ? <Badge tone="brass">saved</Badge> : null}
            <Button
              type="button"
              variant="primary"
              className="h-8 text-xs"
              disabled={pending || draft.title.trim().length === 0}
              onClick={save}
            >
              Save
            </Button>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
