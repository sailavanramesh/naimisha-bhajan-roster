import { NextResponse } from "next/server";

export const runtime = "nodejs"; // important: do NOT run this on Edge

export async function GET(req: Request) {
  const url = new URL(req.url);

  // support both ?k= and ?key=
  const k = url.searchParams.get("k") ?? url.searchParams.get("key") ?? "";
  const expected = process.env.EDIT_KEY ?? "";

  // optional redirect target, default roster
  const r = url.searchParams.get("r") ?? "/roster";

  if (!expected) {
    return NextResponse.json(
      { error: "EDIT_KEY is not set in environment variables" },
      { status: 500 }
    );
  }

  // Always redirect somewhere human-friendly
  const res = NextResponse.redirect(new URL(r, url.origin));

  if (k !== expected) {
    // invalid key -> ensure cookie is cleared
    res.cookies.set("edit", "0", { path: "/", maxAge: 0 });
    return res;
  }

  // valid key -> set edit cookie
  res.cookies.set("edit", "1", {
    path: "/",
    httpOnly: false, // UI reads it on server; httpOnly not required
    sameSite: "lax",
    secure: true, // Vercel is HTTPS
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return res;
}
