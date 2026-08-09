import "./globals.css";
import { Faustina, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";

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
  title: "Naimisha Bhajan Roster",
  description: "Bhajan suggestions, rostering and pitch for the Naimisha Sai Centre",
};

export const viewport = {
  themeColor: "#12141C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {/* Keyboard users land here first. The old build had no skip link. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-key focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-surface"
        >
          Skip to content
        </a>

        <div className="flex min-h-screen">
          <Nav />

          <div className="flex-1">
            <div className="mx-auto max-w-6xl px-3 pb-16 pt-14 sm:px-6 sm:pt-8">
              <header className="no-print mb-6">
                <div className="border-b border-rule pb-4">
                  <h1 className="font-display text-2xl font-semibold tracking-tight text-on-ground sm:text-3xl">
                    Naimisha Bhajan Roster
                  </h1>
                  <p className="mt-1 text-sm text-on-ground-muted">
                    Suggest a set, roster it fairly, remember the pitch.
                  </p>
                </div>
              </header>

              <main id="main">{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
