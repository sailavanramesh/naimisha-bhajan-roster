import "./globals.css";
import { Nav } from "@/components/Nav";
import { YantraFull } from "@/components/Yantra";
import Link from "next/link";
import { headers } from "next/headers";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { getRole, getSignedInSinger, ROLE_LABELS, requireSignIn } from "@/lib/auth";

/*
 * Three roles, deliberately paired (docs/SPEC.md §6).
 *
 * Faustina carries the transliterated Sanskrit — it has the diacritic coverage
 * and reads as belonging to the tradition rather than to a dashboard.
 *
 * They are declared in app/globals.css and served from public/fonts rather
 * than through next/font/google, which fetched them from fonts.gstatic.com at
 * build time and failed three deploys in two days when it could not. The CSS
 * variables are the same names, so nothing downstream noticed.
 */

/*
 * Dev is a different app, and says so everywhere it is seen.
 *
 * Home Screen icons, and — the one that caught Sailavan out — the LINK
 * PREVIEW. Sending both URLs into the same WhatsApp thread produced two
 * identical cards: same mark, same title, same line of description, with only
 * the hostname to tell them apart, in the smallest text on the card.
 *
 * A preview is read at a glance by somebody deciding which to tap, so the
 * three things it shows all change: the picture, the title and the line under
 * it.
 */
const IS_DEV = process.env.APP_ENV === "dev";
const ICONS = IS_DEV ? "/icons/dev" : "/icons";
const APP_TITLE = IS_DEV ? "Naimiṣa Bhajan Roster (DEV)" : "Naimiṣa Bhajan Roster";
const APP_BLURB = IS_DEV
  ? "Test copy — not the live roster. Changes here reach nobody."
  : "Bhajan suggestions, rostering and pitch for Naimisha";

export const metadata = {
  title: APP_TITLE,
  /*
    This is what a shared link previews as — WhatsApp and the rest read it from
    <meta name="description">, which Next renders from here. Kept in step with
    app/manifest.ts, which carries the same line for the installed app.
  */
  description: APP_BLURB,
  applicationName: IS_DEV ? "Naimiṣa DEV" : "Naimiṣa Roster",
  /*
    Without this, Next resolves og:image against "http://localhost:3000" and a
    scraper is handed an image it cannot fetch — the preview then falls back to
    a bare link. AUTH_URL is already the canonical public address and is set in
    production, so reusing it avoids a second setting that could drift out of
    step with the first.
  */
  metadataBase: new URL(process.env.AUTH_URL ?? "http://localhost:3000"),
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
  /*
    What a shared link shows. Next picks up app/opengraph-image.png on its own
    and emits the og:image tags; these give the scraper a title and description
    of their own, since without them some read the page's <title> and others
    fall back to the bare URL.
  */
  openGraph: {
    title: APP_TITLE,
    description: APP_BLURB,
    type: "website",
    siteName: APP_TITLE,
    /*
      Named explicitly for BOTH, from public/, rather than relying on the
      app/opengraph-image.png filename convention — that convention wins over
      anything set here, so while it existed the dev card kept the production
      picture however the metadata was written.
    */
    images: [
      { url: IS_DEV ? "/og-dev.png" : "/og.png", width: 1200, height: 630, type: "image/png" },
    ],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: APP_TITLE,
    description: APP_BLURB,
    images: [IS_DEV ? "/og-dev.png" : "/og.png"],
  },
  /*
    Dev points at its own set — see app/manifest.ts. The apple entry is the
    one that decides what an iPhone puts on the Home Screen; iOS reads it when
    the shortcut is created and never again.
  */
  icons: {
    icon: [
      { url: `${ICONS}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${ICONS}/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: `${ICONS}/apple-touch-icon.png`,
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
  /* A test system should be obvious at a glance — see components/Yantra.tsx. */
  const isDev = process.env.APP_ENV === "dev";
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
    /* The font variables come from app/globals.css now, not from a class. */
    <html lang="en">
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
          <Nav role={role} isDev={isDev} />

          {/*
            min-w-0, and it matters more than it looks.

            A flex child defaults to `min-width: auto`, which means it refuses
            to be narrower than its own content. The roster table declares
            min-w-[720px] — deliberately, so its columns stay usable — and
            scrolls inside its own overflow-x-auto box. But that box could not
            shrink below the table while this column would not shrink either,
            so at 375px the whole PAGE became 404px wide and every screen
            drifted sideways under the thumb. Fixed-position things are placed
            against that wider viewport too, which is how a centred dialog ends
            up half off the screen on a phone.
          */}
          <div className="min-w-0 flex-1">
            <div className="mx-auto max-w-6xl px-3 pb-16 pt-14 sm:px-6 sm:pt-8">
              <header className="no-print mb-6">
                <div className="flex items-center gap-4 border-b border-rule pb-4">
                  <YantraFull size={54} className="shrink-0 text-brass" variant={isDev ? "dev" : "brand"} />
                  <div>
                    <h1 className="font-display text-2xl font-semibold tracking-tight text-on-ground sm:text-3xl">
                      Naimiṣa Bhajan Roster
                      {/*
                        Said in words as well as in colour. Somebody who has
                        both open on a phone should not have to remember which
                        mark means which — and colour alone is not something to
                        rest a "do not touch production" signal on.
                      */}
                      {isDev ? (
                        <span className="ms-2 align-middle rounded-full border border-kumkum/50 bg-kumkum/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-kumkum">
                          dev
                        </span>
                      ) : null}
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

              {/*
                Sound credit. The shruti player uses recordings released under
                CC BY 4.0, which requires naming the author, the source and the
                licence wherever the work is used. It lives in the layout rather
                than on the guide page because the guide is editable content —
                a credit somebody can delete by accident is not a credit.
              */}
              <footer className="mt-10 border-t border-rule pt-3 pb-6 text-[11px] leading-relaxed text-on-ground-muted">
                Tanpura recordings by{" "}
                <a
                  href="https://freesound.org/people/sankalp/"
                  className="underline hover:text-on-ground"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  sankalp
                </a>{" "}
                on{" "}
                <a
                  href="https://freesound.org/people/sankalp/packs/9600/"
                  className="underline hover:text-on-ground"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Freesound
                </a>
                , trimmed to loops and retuned for this app, used under{" "}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  className="underline hover:text-on-ground"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  CC BY 4.0
                </a>
                .
              </footer>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
