/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * Standalone output for Azure App Service.
   *
   * The first deploy shipped the repo plus a `npm prune --omit=dev`
   * node_modules and ran `next start`. The container died with
   *   Error: Cannot find module '../server/require-hook'
   * because a pruned tree is not a supported way to run Next.
   *
   * Standalone is the documented answer: Next traces exactly the files the
   * server needs and emits a self-contained `.next/standalone` with its own
   * `server.js`. Smaller, and it cannot drift from what the build produced.
   */
  output: "standalone",

  /*
   * Cache the things that never change.
   *
   * Next stamps its own /_next/static output with `immutable` and a year, but
   * everything in public/ is served `public, max-age=0` — so every visit
   * revalidated twelve font files and, the moment anybody touched the shruti
   * player, six tanpura recordings, each one a conditional request of its own
   * over a connection that was HTTP/1.1 and therefore six-at-a-time. That is a
   * good part of why opening the app was quick sometimes and not others: the
   * page itself was never the slow part.
   *
   * These three directories are safe to freeze because their names are stable
   * AND their contents are: a font is replaced by adding a file, not by editing
   * one, and the tanpura loops are tuned recordings of fixed pitches. Anything
   * whose content can change under a fixed name must NOT be listed here.
   *
   * sw.js is deliberately absent. A service worker is how the app updates
   * itself, and a cached one is an app that cannot.
   */
  async headers() {
    const immutable = [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ];
    return [
      { source: "/fonts/:path*", headers: immutable },
      { source: "/audio/:path*", headers: immutable },
      { source: "/icons/:path*", headers: immutable },
    ];
  },
};
module.exports = nextConfig;
