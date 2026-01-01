import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const key = url.searchParams.get("k");
  const editKey = process.env.EDIT_KEY;

  const res = NextResponse.next();

  // If the key matches, set a cookie that enables edit mode
  if (key && editKey && key === editKey) {
    res.cookies.set("edit", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Optional: strip the key from the URL by redirecting to same path without ?k=
    // Keeps the "anyone with link can edit" behavior but reduces accidental copying of the key.
    const clean = new URL(req.url);
    clean.searchParams.delete("k");
    return NextResponse.redirect(clean, { headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
