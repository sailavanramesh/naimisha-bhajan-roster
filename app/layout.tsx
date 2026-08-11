import "./globals.css";
import { Faustina, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { YantraFull } from "@/components/Yantra";
import Link from "next/link";
import { headers } from "next/headers";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { getRole, getSignedInSinger, ROLE_LABELS, requireSignIn } from "@/lib/auth";

/**
 * Three roles, deliberately paired (docs/SPEC.md §6).
 *
 * Faustina carries the transliterated Sanskrit — it has the diacritic coverage
 * and reads as belonging to the tradition rather than to a dashboard.
 */
const display = Faustina({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Naimiṣa Bhajan Roster",
  /*
    This is what a shared link previews as — WhatsApp and the rest read it from
    <meta name="description">, which Next renders from here. Kept in step with
    app/manifest.ts, which carries the same line for the installed app.
  */
  description: "Bhajan suggestions, rostering and pitch for Naimisha",
  applicationName: "Naimiṣa Roster",
  /*
   * iOS needs this as well as the manifest. Without `capable`, an
   * "Add to Home Screen" icon opens in Safari with the URL bar, back/forward
   * and share buttons still showing — which is exactly what it was doing.
   * `title` is what appears under the icon; the full name is too long there.
   */
  appleWebApp: {
    capable: true,
    title: "Naimiṣa Roster",
    statusBarStyle: "default" as const,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  /*
   * Was #12141C, left over from the dark theme this app no longer uses. On an
   * installed iPhone app that is the colour of the status bar area, so it read
   * as a black band above a paper-coloured page. Now --ground.
   */
  themeColor: "#F7F3ED",
  width: "device-width",
  initialScale: 1,
};

function SignInWall() {
  return (
    <div className="rounded-[14px] border border-card-edge bg-surface p-6 text-on-surface">
      <h2 className="font-display text-2xl font-semibold">Naimiṣa Bhajan Roster</h2>
      <p className="mt-2 max-w-lg text-sm text-on-surface-muted">
        This is in testing with a small group. Sign in with the Google account the
        coordinator added for you.
      </p>
      {/*
        This must be the real sign-in control, not a link to /signin. The wall
        wraps every page, so a link to /signin rendered this same wall again and
        the button appeared to do nothing. See components/GoogleSignIn.tsx.
      */}
      <div className="mt-4">
        <GoogleSignIn />
      </div>
    </div>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  const signedIn = await getSignedInSinger();

  /*
   * The wall must never cover the sign-in page itself, or signing in becomes
   * unreachable. A layout cannot see the pathname, so middleware.ts stamps it
   * onto a request header for exactly this check.
   */
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isAuthRoute = pathname === "/signin" || pathname.startsWith("/api/auth");
  const walled = requireSignIn && role === "viewer" && !isAuthRoute;
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        {/*
          Written by hand because Next 15 emits only the standardised
          `mobile-web-app-capable` for metadata.appleWebApp.capable, and iOS has
          historically acted on the apple- prefixed name alone. Without it an
          "Add to Home Screen" icon opens inside Safari, complete with URL bar,
          back/forward and share buttons. Cheap insurance against a difference
          that is invisible until someone installs it on a phone.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {/* Keyboard users land here first. The old build had no skip link. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-[12px] focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-surface"
        >
          Skip to content
        </a>

        <div className="flex min-h-screen">
          <Nav role={role} />

          <div className="flex-1">
            <div className="mx-auto max-w-6xl px-3 pb-16 pt-14 sm:px-6 sm:pt-8">
              <header className="no-print mb-6">
                <div className="flex items-center gap-4 border-b border-rule pb-4">
                  <YantraFull size={54} className="shrink-0 text-brass" />
                  <div>
                    <h1 className="font-display text-2xl font-semibold tracking-tight text-on-ground sm:text-3xl">
                      Naimiṣa Bhajan Roster
                    </h1>
                    {/* Strapline removed at Sailavan's request, 2026-08-11. The
                        wording is kept verbatim in PROGRESS.md under "Removed
                        copy" so it can come back unchanged. */}
                    <p className="mt-1 text-sm text-on-ground-muted">
                      <Link
                        href="/signin"
                        className="rounded-full border border-rule px-2 py-0.5 text-[11px] hover:border-brass/50"
                      >
                        {signedIn ? `${signedIn.name} · ${ROLE_LABELS[role]}` : ROLE_LABELS[role]}
                      </Link>
                    </p>
                  </div>
                </div>
              </header>

              <main id="main">
                {/*
                  Closed testing: everything is behind sign-in. Enforced in the
                  layout so it covers every page at once — a per-page check
                  would eventually miss one.
                */}
                {walled ? <SignInWall /> : children}
              </main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
