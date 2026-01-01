import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/";

  const safeNext = next.startsWith("/") ? next : "/";

  const res = NextResponse.redirect(new URL(safeNext, url.origin));
  // delete cookie
  res.cookies.set("edit", "0", { path: "/", maxAge: 0 });
  return res;
}
