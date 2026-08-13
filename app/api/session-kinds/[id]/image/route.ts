import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * A session kind's picture, as a file the browser can cache.
 *
 * The pictures live in the database as data URLs (see the SessionCategory
 * model, which explains why). That is right for the admin screen, where one is
 * edited at a time, and wrong for the calendar: a month can hold fifty
 * sessions, the pictures run 17–68KB each, and inlining them into the page
 * would send the same few images over and over on a phone.
 *
 * So they are served from here instead, keyed by id and stamped with the
 * kind's `updatedAt`. The response is immutable for a year: a changed picture
 * changes the stamp, which changes the URL, which is a different cache entry.
 * The calendar then costs one request per kind for the whole month, and none
 * at all on the second visit.
 *
 * Not access-controlled beyond signing in — a small square picture of a
 * festival is not sensitive, and the id has to be known to ask for it.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  const kind = await prisma.sessionCategory.findUnique({
    where: { id },
    select: { image: true },
  });
  if (!kind?.image) return new NextResponse("Not found", { status: 404 });

  // Stored as `data:<mime>;base64,<payload>`.
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(kind.image.trim());
  if (!match) return new NextResponse("Not an image", { status: 415 });

  const [, mime, payload] = match;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, "base64");
  } catch {
    return new NextResponse("Not an image", { status: 415 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": mime,
      "content-length": String(bytes.byteLength),
      // Safe because the URL carries the kind's updatedAt: a new picture is a
      // new URL. Without that stamp this would be a trap.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
