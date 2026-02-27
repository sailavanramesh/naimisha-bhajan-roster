import { NextRequest, NextResponse } from "next/server";

function stripParam(url: URL, param: string) {
  url.searchParams.delete(param);
  // Clean trailing "?" automatically handled by URL
  return url;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // Optional: allow logout via ?logout=1
  if (url.searchParams.get("logout") === "1") {
    const nextUrl = stripParam(new URL(url.toString()), "logout");
    const res = NextResponse.redirect(nextUrl);
    res.cookies.set("edit", "", { path: "/", maxAge: 0 });
    return res;
  }

  const k = url.searchParams.get("k");
  const editKey = process.env.EDIT_KEY;

  // If correct key provided, set cookie then redirect to same URL WITHOUT the key
  if (k && editKey && k === editKey) {
    const nextUrl = stripParam(new URL(url.toString()), "k");
    const res = NextResponse.redirect(nextUrl);

    res.cookies.set("edit", "1", {
      path: "/",
      httpOnly: false, // app reads it client-side sometimes; safe enough for this use
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return res;
  }

  return NextResponse.next();
}

// Run on all routes (excluding Next internals)
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};