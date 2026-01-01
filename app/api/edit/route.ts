import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k") ?? "";
  const next = url.searchParams.get("next") ?? "/";

  const editKey = process.env.EDIT_KEY ?? "";

  // Basic safety: only allow internal redirects
  const safeNext = next.startsWith("/") ? next : "/";

  if (!editKey || k !== editKey) {
    return NextResponse.json({ error: "Invalid key" }, { status: 401 });
  }

  const res = NextResponse.redirect(new URL(safeNext, url.origin));
  res.cookies.set("edit", "1", {
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return res;
}
