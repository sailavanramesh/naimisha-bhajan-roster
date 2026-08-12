"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import {
  addSessionCategory,
  removeSessionCategory,
  setCategoryImage,
} from "@/app/roster/[id]/metaActions";

/**
 * The kinds of session the centre runs.
 *
 * A table rather than an enum precisely so this screen can exist: Sailavan
 * said he would create the categories himself, and a vocabulary the group owns
 * should not need a deploy to change.
 *
 * Removing one leaves its sessions alone — they simply become uncategorised —
 * so the confirm says how many that is rather than warning about nothing.
 */
/**
 * Shrink a chosen file to a small square data URL, in the browser.
 *
 * Uploading a three-megabyte photograph to draw a twenty-pixel badge would be
 * absurd, and doing the resize here means the server never has to hold the
 * big one at all.
 */
async function shrinkToDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  // Centre crop to a square: these are drawn as circles and badges, and a
  // squashed picture looks worse than a cropped one.
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function SessionCategories({
  categories,
  canEdit,
}: {
  categories: { id: string; name: string; sessions: number; image: string | null }[];
  canEdit: boolean;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const add = () =>
    startTransition(async () => {
      const res = await addSessionCategory(name);
      setMessage(res.ok ? { ok: true, text: `Added "${name}".` } : { ok: false, text: res.error });
      if (res.ok) setName("");
    });

  const remove = (id: string, label: string) =>
    startTransition(async () => {
      const res = await removeSessionCategory(id);
      setMessage(
        res.ok
          ? {
              ok: true,
              text:
                res.freed === 0
                  ? `Removed "${label}".`
                  : `Removed "${label}". ${res.freed} session${res.freed === 1 ? " is" : "s are"} now uncategorised.`,
            }
          : { ok: false, text: res.error },
      );
    });

  return (
    <div className="grid gap-2">
      <ul className="grid gap-1">
        {categories.length === 0 ? (
          <li className="text-sm text-on-surface-muted">None yet.</li>
        ) : (
          categories.map((c) => (
            <li
              key={c.id}
              className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-[8px] px-2 py-1 text-sm odd:bg-surface/60"
            >
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.image}
                  alt=""
                  className="h-7 w-7 rounded-full border border-rule-surface object-cover"
                />
              ) : (
                <span className="h-7 w-7 rounded-full border border-dashed border-rule-surface" />
              )}
              <span className="truncate font-medium">{c.name}</span>
              <span className="whitespace-nowrap text-xs text-on-surface-muted">
                {c.sessions === 0 ? "unused" : `${c.sessions} session${c.sessions === 1 ? "" : "s"}`}
              </span>
              {canEdit ? (
                <span className="flex items-center gap-2">
                  <label className="cursor-pointer text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface">
                    {c.image ? "change image" : "add image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          const image = await shrinkToDataUrl(file);
                          startTransition(async () => {
                            const res = await setCategoryImage({ id: c.id, image });
                            setMessage(
                              res.ok
                                ? { ok: true, text: `Image set for "${c.name}".` }
                                : { ok: false, text: res.error },
                            );
                          });
                        } catch {
                          setMessage({ ok: false, text: "Could not read that image." });
                        }
                      }}
                    />
                  </label>
                  {c.image ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await setCategoryImage({ id: c.id, image: null });
                          setMessage({ ok: true, text: `Image removed from "${c.name}".` });
                        })
                      }
                      className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-warn"
                    >
                      remove image
                    </button>
                  ) : null}
                  <Button
                    type="button"
                    variant="danger"
                    className="h-8 text-xs"
                    disabled={pending}
                    onClick={() => remove(c.id, c.name)}
                  >
                    Remove
                  </Button>
                </span>
              ) : (
                <span />
              )}
            </li>
          ))
        )}
      </ul>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category, e.g. Ladies Day"
            aria-label="New session category"
            className="h-9 w-56"
          />
          <Button
            type="button"
            variant="primary"
            className="h-9"
            disabled={pending || name.trim().length === 0}
            onClick={add}
          >
            Add
          </Button>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={message.ok ? "text-xs text-brass-ink" : "text-xs text-warn"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
