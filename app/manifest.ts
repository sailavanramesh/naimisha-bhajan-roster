import type { MetadataRoute } from "next";

/*
 * Rendered per request, not at build time.
 *
 * APP_ENV is an Azure app setting, so it does not exist on the GitHub runner
 * that builds this — a prerendered manifest therefore always described
 * production, whichever app it was serving. That is how the dev shortcut ended
 * up wearing the real icon while the app inside it was clearly dev.
 */
export const dynamic = "force-dynamic";

/**
 * The web app manifest — what turns a Home Screen shortcut into an app.
 *
 * Without this, iOS treats "Add to Home Screen" as a bookmark: it opens in
 * Safari with the URL bar, back/forward, share and done buttons still on
 * screen, which is what it was doing before this existed. `display:
 * "standalone"` is what removes all of that.
 *
 * Note for anyone hitting the same thing again: iOS reads the manifest at the
 * moment the icon is added and does not revisit it. An icon added before this
 * shipped keeps the old behaviour forever — it has to be deleted and re-added.
 *
 * Next serves this at /manifest.webmanifest and links it from every page.
 */
export default function manifest(): MetadataRoute.Manifest {
  /*
   * Dev gets its own icons and its own name.
   *
   * The mark in the app was already inverted on dev, but the HOME SCREEN icon
   * is a static file and knew nothing about it — so an installed dev shortcut
   * was indistinguishable from the real app, which is the one place the
   * distinction matters most: you tap it without reading anything.
   *
   * iOS reads this once, when the icon is added, and never revisits it. A
   * shortcut added before this has to be deleted and re-added.
   */
  const isDev = process.env.APP_ENV === "dev";
  const icons = isDev ? "/icons/dev" : "/icons";

  return {
    name: isDev ? "Naimiṣa Roster (DEV)" : "Naimiṣa Bhajan Roster",
    short_name: isDev ? "Naimiṣa DEV" : "Naimiṣa",
    // Same line as metadata.description in app/layout.tsx.
    description: "Bhajan suggestions, rostering and pitch for Naimisha",
    // Opens on the roster: what somebody actually came to look at. The
    // dashboard is a coordinator's overview and members no longer see it.
    /*
      The front door, not the calendar.
      
      "/" resolves to the nearest future session that has anything on it — see
      app/page.tsx. Pointed at /roster, the installed app skipped that entirely
      and always opened on the calendar, which is what Sailavan was seeing.
      
      An already-installed app may keep the old start_url until it is removed
      from the Home Screen and added again; the in-app links are unaffected.
    */
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Matches --ground in globals.css, so the splash and the status bar area
    // are the same paper colour as the app rather than the old dark theme.
    background_color: "#F7F3ED",
    theme_color: "#F7F3ED",
    icons: [
      { src: `${icons}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${icons}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      // Inset and padded, so Android's circular crop cannot clip the yantra.
      {
        src: `${icons}/icon-512-maskable.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
