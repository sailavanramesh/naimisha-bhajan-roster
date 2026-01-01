// middleware.ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const editKey = process.env.EDIT_KEY || "";

  // Turn ON edit mode with ?k=YOUR_KEY (then redirect to clean URL)
  const k = url.searchParams.get("k");
  if (k && editKey && k === editKey) {
    const clean = new URL(url.toString());
    clean.searchParams.delete("k");

    const res = NextResponse.redirect(clean);
    res.cookies.set("edit", "1", {
      path: "/",
      sameSite: "lax",
      secure: true,
      // not httpOnly so client UX can reflect it if needed; change to true if you prefer
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
    return res;
  }

  // Optional: Turn OFF edit mode with ?readonly=1
  const readonly = url.searchParams.get("readonly");
  if (readonly === "1") {
    const clean = new URL(url.toString());
    clean.searchParams.delete("readonly");

    const res = NextResponse.redirect(clean);
    res.cookies.set("edit", "0", { path: "/", maxAge: 0 });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
      Run middleware on all pages/routes except Next internals and common static assets.
    */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
