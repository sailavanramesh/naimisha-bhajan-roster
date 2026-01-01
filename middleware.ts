// middleware.ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  try {
    const url = req.nextUrl;

    const editKey = process.env.EDIT_KEY ?? "";
    const k = url.searchParams.get("k");

    // Enable edit mode: ?k=EDIT_KEY
    if (k && editKey && k === editKey) {
      const clean = url.clone();
      clean.searchParams.delete("k");

      const res = NextResponse.redirect(clean);
      res.cookies.set("edit", "1", {
        path: "/",
        sameSite: "lax",
        secure: true,
        httpOnly: false,
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
      return res;
    }

    // Disable edit mode: ?readonly=1
    if (url.searchParams.get("readonly") === "1") {
      const clean = url.clone();
      clean.searchParams.delete("readonly");

      const res = NextResponse.redirect(clean);
      res.cookies.set("edit", "0", { path: "/", maxAge: 0 });
      return res;
    }

    return NextResponse.next();
  } catch (err) {
    // IMPORTANT: never let middleware crash the whole app
    console.error("MIDDLEWARE_ERROR", err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
