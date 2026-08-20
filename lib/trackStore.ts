/**
 * lib/trackStore.ts — where a programme's audio lives, and what may go there.
 *
 * Deliberately NOT Azure Blob Storage. Sailavan asked for no new spend, and the
 * B1 App Service plan already includes 10 GB of persistent storage at /home —
 * 216 MB of it used when this was written. So tracks go on the app's own disk.
 *
 * Three things about that directory decide the rules below:
 *
 *   1. `/home/data` SURVIVES a deploy. `/home/site/wwwroot` does not — it is
 *      replaced wholesale — so nothing may be written under wwwroot or it will
 *      vanish the next time anything ships.
 *   2. The 10 GB is PER PLAN, and dev and prod are both on asp-naimisha-roster.
 *      An upload on dev spends the same allowance as one on prod, which is why
 *      there is a budget check here rather than trust.
 *   3. Basic tier has no automatic backup. A track is re-uploadable, not
 *      recoverable, and the UI says so.
 *
 * The functions here are pure apart from the two that touch the filesystem, so
 * the rules can be tested without writing anything.
 */

import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Where tracks live.
 *
 * `/home/data` on App Service. Overridable so a developer can run against a
 * local folder — there is no /home/data on a Mac, and creating one would put
 * uploads somewhere nobody expects.
 */
export function tracksDir(): string {
  const configured = process.env.TRACKS_DIR?.trim();
  if (configured) return configured;
  return process.env.WEBSITE_INSTANCE_ID ? '/home/data/tracks' : '.tracks';
}

/**
 * What a browser will actually play, mapped to the extension we store under.
 *
 * Kept small on purpose. Every one of these decodes in Safari, Chrome and
 * Firefox without a codec pack; the temptation is to accept anything audio/*
 * and then discover in a hall that somebody's .flac plays on one phone.
 */
export const ACCEPTED: Readonly<Record<string, string>> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

/** Extensions we will serve, derived from ACCEPTED so the two cannot drift. */
export const SERVED_EXTENSIONS: readonly string[] = [...new Set(Object.values(ACCEPTED))];

/** Content type to send back when serving, keyed by stored extension. */
export const CONTENT_TYPE: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

/**
 * Biggest single upload.
 *
 * A five-minute track at 192 kbps is about 7 MB, so 30 MB is roomy for an MP3
 * and still refuses somebody dragging in an uncompressed hour-long recording
 * that would eat the plan's allowance on its own.
 */
export const MAX_BYTES = 30 * 1024 * 1024;

/**
 * How much of the plan's 10 GB this app may use before refusing new uploads.
 *
 * Four gigabytes, not ten: the allowance is shared with the other app on the
 * plan and with the deployed build itself, and an App Service that fills its
 * own disk fails in ways that have nothing to do with audio. Better to refuse
 * an upload with a clear message.
 */
export const BUDGET_BYTES = 4 * 1024 * 1024 * 1024;

/** The extension to store a given upload under, or null if we will not take it. */
export function extensionFor(contentType: string | null | undefined): string | null {
  const key = (contentType ?? '').split(';')[0].trim().toLowerCase();
  return ACCEPTED[key] ?? null;
}

/**
 * Is this a stored-file name we are willing to look up?
 *
 * The name comes back from the database, but it reaches the filesystem, so it
 * is checked against a strict shape rather than trusted: id, a dot, and a known
 * extension. No slashes, no dots, nothing that could climb out of the folder.
 */
const STORED_NAME = /^[a-z0-9]{8,40}\.[a-z0-9]{2,4}$/;

export function isSafeStoredName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim();
  if (!STORED_NAME.test(n)) return false;
  const ext = n.slice(n.lastIndexOf('.') + 1);
  return SERVED_EXTENSIONS.includes(ext);
}

/** The stored name for a new upload. The id comes from the caller (cuid). */
export function storedName(id: string, extension: string): string {
  return `${id}.${extension}`;
}

/** Absolute path of a stored track. Refuses anything that fails the shape check. */
export function trackPath(name: string): string | null {
  if (!isSafeStoredName(name)) return null;
  return join(tracksDir(), name);
}

/**
 * Tidy a filename for display. Never used as a path.
 *
 * The client percent-encodes it, because an HTTP header may only carry Latin-1
 * and a filename may be anything — "Śrī Rāma.mp3" would otherwise be refused
 * outright by setRequestHeader. Decoding is guarded: a malformed sequence
 * throws, and a bad filename must not fail an upload that has already landed.
 */
export function displayName(original: string | null | undefined): string {
  let raw = original ?? '';
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Keep it as sent; it is a label, not a path.
  }
  const base = raw.split(/[\\/]/).pop() ?? '';
  const trimmed = base.trim().slice(0, 120);
  return trimmed || 'track';
}

/** Human size, for a UI that has to explain a refusal. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Make sure the directory exists. Safe to call repeatedly. */
export async function ensureTracksDir(): Promise<string> {
  const dir = tracksDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Bytes currently held in tracks.
 *
 * Walks the directory rather than summing a column, because the directory is
 * the truth: a failed upload or a hand-copied file counts against the plan
 * whether or not the database knows about it.
 */
export async function usedBytes(): Promise<number> {
  const dir = tracksDir();
  let total = 0;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0; // nothing uploaded yet
  }
  for (const name of names) {
    try {
      const s = await stat(join(dir, name));
      if (s.isFile()) total += s.size;
    } catch {
      // Vanished between listing and stat. Not our problem to report.
    }
  }
  return total;
}

/** Why an upload was refused, in words a person can act on. */
export type Refusal = { ok: false; reason: string };
export type Accepted = { ok: true; extension: string };

export function checkUpload({
  contentType,
  declaredBytes,
  usedBytes: used,
}: {
  contentType: string | null | undefined;
  declaredBytes: number | null;
  usedBytes: number;
}): Accepted | Refusal {
  const extension = extensionFor(contentType);
  if (!extension) {
    return {
      ok: false,
      reason: `That is not an audio file this app will play. Use MP3, M4A, OGG or WAV.`,
    };
  }
  if (declaredBytes !== null && declaredBytes > MAX_BYTES) {
    return {
      ok: false,
      reason: `That file is ${humanSize(declaredBytes)}. The limit is ${humanSize(MAX_BYTES)} — an MP3 of a whole bhajan is usually under 10 MB.`,
    };
  }
  if (used >= BUDGET_BYTES) {
    return {
      ok: false,
      reason: `The app has used its ${humanSize(BUDGET_BYTES)} of track storage. Delete a track that is no longer needed before adding another.`,
    };
  }
  return { ok: true, extension };
}
