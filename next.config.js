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
};
module.exports = nextConfig;
