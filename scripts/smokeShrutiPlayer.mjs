/**
 * A browser smoke test for the shruti player. Run it before shipping a change
 * to ShrutiPlayer or tanpuraEngine.
 *
 * It exists because the unit tests cannot fail the way this feature failed. On
 * 2026-08-20 the engine's `getState` returned a freshly built object on every
 * call; `useSyncExternalStore` compares that value by reference to decide
 * whether to re-render, so it re-rendered forever and React threw error #185.
 * Every page carrying a play control went white on dev. Types, lint and 905
 * unit tests all passed — the bug only exists once React is actually running.
 *
 * Usage, against a locally built app:
 *
 *   npm run build
 *   rm -rf .next/standalone/public .next/standalone/.next/static
 *   cp -r public .next/standalone/public
 *   cp -r .next/static .next/standalone/.next/static
 *   cp .env.local .next/standalone/.env.local     # dev database
 *   REQUIRE_SIGN_IN=false PORT=3999 node .next/standalone/server.js &
 *   node scripts/smokeShrutiPlayer.mjs http://localhost:3999/roster/<id>
 *
 * Note the `rm -rf` before copying: `cp -r public .next/standalone/public` onto
 * an existing directory nests it, and a half-stale static directory serves
 * mismatched chunk hashes, which looks exactly like an application bug.
 *
 * Needs Chrome installed; uses the playwright-core already in devDependencies.
 */
import { chromium } from "playwright-core";

const url = process.argv[2];
if (!url) {
  console.error("usage: node scripts/smokeShrutiPlayer.mjs <url of a page with pitches>");
  process.exit(2);
}

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();

const failures = [];
page.on("pageerror", (e) => failures.push("uncaught: " + e.message.split("\n")[0]));

// Headless Chrome has no output device, so record what WOULD have been played
// rather than trying to hear it. The playback rate is the interesting part —
// it is the whole retuning calculation, observed at the point of use.
await page.addInitScript(() => {
  window.__rates = [];
  window.__ramps = [];
  // A retune onto the same recording GLIDES: it ramps playbackRate on the node
  // already running rather than starting a new one, so watching starts alone
  // would miss it entirely.
  const ramp = AudioParam.prototype.linearRampToValueAtTime;
  AudioParam.prototype.linearRampToValueAtTime = function (value, time) {
    window.__ramps.push(value);
    return ramp.call(this, value, time);
  };
  const Ctx = window.AudioContext;
  window.AudioContext = class extends Ctx {
    createBufferSource() {
      const node = super.createBufferSource();
      const start = node.start.bind(node);
      node.start = (...a) => {
        window.__rates.push(node.playbackRate.value);
        return start(...a);
      };
      return node;
    }
  };
});

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);

// The nudge controls only render for an editor. Pass ?k=<EDITOR_KEY> on the
// URL and the middleware sets the role cookie, so the whole editable grid —
// the case this script most needs to cover — is reachable without signing in.

const body = (await page.textContent("body")) || "";
if (body.includes("Application error")) failures.push("the page crashed on load");

const buttons = page.locator('button[aria-label*="tanpura"]');
const count = await buttons.count();
console.log(`shruti controls on the page: ${count}`);
if (count === 0) failures.push("no play controls rendered — is there a pitch on this page?");

if (count > 0) {
  await buttons.first().click();
  await page.waitForTimeout(2500);
  if ((await buttons.first().getAttribute("aria-pressed")) !== "true")
    failures.push("clicking the first control did not start it");
}

// The switch is its own case: an earlier version stopped the drone that had
// just started, from the component that lost the race.
if (count > 1) {
  await buttons.nth(1).click();
  await page.waitForTimeout(2500);
  if ((await buttons.nth(1).getAttribute("aria-pressed")) !== "true")
    failures.push("switching to a second control did not leave it playing");
  if ((await buttons.first().getAttribute("aria-pressed")) !== "false")
    failures.push("the first control still claims to be playing");
}

// Nudging the shruti up or down must retune the running drone rather than
// leave it on the pitch it started at. Only the editable roster grid has these
// controls, which is why the URL wants ?k=<EDITOR_KEY>.
//
// Five steps, because the two routes must both be exercised: a step that stays
// on one recording GLIDES (a playbackRate ramp, no new source) and a step onto
// the next recording CROSSFADES (a new source). Four of the twelve semitone
// steps cross, so five nudges are certain to meet at least one of each.
const nudge = page.locator('button[aria-label="Shruti up one semitone"]');
if (count > 0 && (await nudge.count()) > 0) {
  await buttons.first().click();
  await page.waitForTimeout(2000);

  let glides = 0;
  let crossfades = 0;
  let stopped = false;

  for (let step = 0; step < 5; step++) {
    const starts = await page.evaluate(() => window.__rates.length);
    const ramps = await page.evaluate(() => window.__ramps.length);

    await nudge.first().click();
    await page.waitForTimeout(1400);

    const startsNow = await page.evaluate(() => window.__rates.length);
    const rampsNow = await page.evaluate(() => window.__ramps.length);

    if (startsNow > starts) crossfades++;
    else if (rampsNow > ramps) glides++;
    else failures.push(`nudge ${step + 1} did not retune the drone at all`);

    if ((await buttons.first().getAttribute("aria-pressed")) !== "true") stopped = true;
  }

  console.log(`nudges: ${glides} glided, ${crossfades} crossfaded`);
  if (stopped) failures.push("the drone stopped part-way through nudging");
  if (glides === 0) failures.push("no nudge glided — every step started a new recording");
  if (crossfades === 0)
    failures.push("no nudge crossfaded — five steps should cross a recording boundary");
}

const rates = await page.evaluate(() => window.__rates);
console.log("playback rates started:", rates);
if (count > 0 && rates.length === 0) failures.push("nothing was ever handed to Web Audio");
for (const r of rates) {
  if (r < 0.79 || r > 1.27) failures.push(`playback rate ${r} is outside the +-4 semitone range`);
}

await browser.close();

if (failures.length) {
  console.error("\nFAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("\nOK — controls render, play, and hand sane rates to Web Audio.");
