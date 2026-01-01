import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = url.searchParams.get("r") ?? "/roster";
  const res = NextResponse.redirect(new URL(r, url.origin));
  res.cookies.set("edit", "0", { path: "/", maxAge: 0 });
  return res;
}
