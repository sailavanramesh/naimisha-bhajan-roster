"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createSong } from "@/app/songs/actions";

/**
 * Start a chant.
 *
 * Songs arrive with a programme — somebody builds a running order and the song
 * is created as a side effect of naming it. Chants have no such doorway: an
 * ashtottara is not performed at a programme, it is recited, so the list is the
 * only place one can be started from and this is the button that does it.
 *
 * It goes straight to the new entry rather than adding a row to the list.
 * Typing the title is the beginning of the job, not the end of it — the words
 * still have to go in, and the verse editor is on the other page.
 */
export function NewChant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add a chant
      </Button>
    );
  }

  const submit = () => {
    const name = title.trim();
    if (!name) {
      setError("Give it a title.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createSong({ title: name, kind: "chant" });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/songs/${result.id}`);
    });
  };

  return (
    <div className="grid gap-2 rounded-[14px] border border-card-edge bg-surface p-3">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Shirdi Sai Ashtottara Shatanamavali"
        aria-label="Title of the chant"
        disabled={pending}
      />
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
