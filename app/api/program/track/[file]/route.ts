import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getRole, can } from "@/lib/auth";
import { CONTENT_TYPE, trackPath } from "@/lib/trackStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve a programme's audio, a piece at a time.
 *
 * The whole point of this route is the Range header. Dragging the scrubber in
 * an <audio> element makes the browser ask for a byte range; a server that
 * answers 200 with the whole file every time forces a re-download from the
 * start, which on a phone in a hall is the difference between a track that can
 * be cued and one that cannot. So: 206, Content-Range, and only the bytes
 * asked for.
 *
 * `Accept-Ranges: bytes` on the full response is what tells the browser it may
 * ask at all — without it Chrome will not offer a seekable scrubber for a
 * stream whose length it has not proven.
 *
 * Never reads a path from the URL. The segment is a stored NAME, re-checked
 * against a strict shape by `trackPath`, which returns null for anything with
 * a slash or an unexpected extension.
 */
export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const role = await getRole();
  // The same line the programme page draws: a viewer sees nothing, everybody
  // else may listen. A member singing in the programme needs this.
  if (!can(role, "viewAllPages") && role === "viewer") {
    return new NextResponse("Not for you", { status: 403 });
  }

  const { file } = await ctx.params;
  const path = trackPath(file);
  if (!path) return new NextResponse("Not found", { status: 404 });

  let size: number;
  try {
    const s = await stat(path);
    if (!s.isFile()) return new NextResponse("Not found", { status: 404 });
    size = s.size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const extension = file.slice(file.lastIndexOf(".") + 1);
  const contentType = CONTENT_TYPE[extension] ?? "application/octet-stream";

  const common = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    // Private: these sit behind sign-in and must not land in a shared cache.
    // Still worth caching in the browser — a track does not change under a
    // name, because a replacement gets a new one.
    "Cache-Control": "private, max-age=3600",
  };

  const range = req.headers.get("range");
  if (!range) {
    return new NextResponse(toWeb(createReadStream(path)), {
      status: 200,
      headers: { ...common, "Content-Length": String(size) },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    return new NextResponse("Bad range", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  // "bytes=-500" means the LAST 500 bytes, not "from 0 to 500". Getting this
  // backwards serves the wrong audio for a seek near the end of a track.
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix <= 0) {
      return new NextResponse("Bad range", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return new NextResponse("Bad range", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  return new NextResponse(toWeb(createReadStream(path, { start, end })), {
    status: 206,
    headers: {
      ...common,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}

/** Node stream to the web stream a Response wants. */
function toWeb(stream: import("node:stream").Readable): ReadableStream {
  return Readable.toWeb(stream) as unknown as ReadableStream;
}
