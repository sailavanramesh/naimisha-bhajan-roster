import type { MetadataRoute } from "next";

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
  return {
    name: "Naimiṣa Bhajan Roster",
    short_name: "Naimiṣa",
    // Same line as metadata.description in app/layout.tsx.
    description: "Bhajan suggestions, rostering and pitch for Naimisha",
    // Opens on the roster: what somebody actually came to look at. The
    // dashboard is a coordinator's overview and members no longer see it.
    start_url: "/roster",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Matches --ground in globals.css, so the splash and the status bar area
    // are the same paper colour as the app rather than the old dark theme.
    background_color: "#F7F3ED",
    theme_color: "#F7F3ED",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Inset and padded, so Android's circular crop cannot clip the yantra.
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
