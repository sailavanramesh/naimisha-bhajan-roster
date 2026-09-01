import { chromium } from "playwright-core";

/**
 * A browser smoke test for the compact track controls in a running order.
 *
 * It exists because of the bug it now guards. The scrubber read its duration
 * only from `loadedmetadata`, and with a warm cache that event has already
 * fired by the time the effect attaches — so `length` stayed 0, the input was
 * `disabled`, and dragging it did nothing. Sailavan, 2026-09-01: "scrubbing
 * forward or backward doesn't move the song forward or back, it just continues
 * to play from where it was." Types, lint and 1153 unit tests were all clean;
 * the fault only exists once a browser is decoding real audio.
 *
 * A pair has a SECOND requirement no unit test reaches: the karaoke half has to
 * move with the sung half, or the vocals switch lands somewhere else in the
 * music. That is asserted here too.
 *
 * Usage — needs real audio on disk, because seeking a 404 proves nothing:
 *
 *   # find a song whose pair is uploaded, and note the two file names
 *   mkdir -p .tracks
 *   ffmpeg -f lavfi -i "sine=frequency=440:duration=300" .tracks/<trackFile>
 *   ffmpeg -f lavfi -i "sine=frequency=220:duration=300" .tracks/<karaokeTrackFile>
 *   REQUIRE_SIGN_IN=false EDITOR_KEY=k npx next dev -p 3999 &
 *   node scripts/smokePlayer.mjs http://localhost:3999 <programSessionId> k
 *
 * `.tracks` is the local tracks directory (lib/trackStore.ts) and is gitignored.
 * It must run from inside the repo or `playwright-core` will not resolve.
 */

const base = process.argv[2] ?? "http://localhost:3999";
const program = process.argv[3];
const key = process.argv[4] ?? process.env.EDITOR_KEY ?? "smoke-editor";
if (!program) {
  console.error("usage: node scripts/smokePlayer.mjs <base> <programSessionId> [editorKey]");
  process.exit(2);
}

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 950 } });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(`${base}/?k=${key}`, { waitUntil: "domcontentloaded" });
await page.goto(`${base}/program/${program}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

/** The first pair on the page: the compact player's lead and its silent shadow. */
const pair = () =>
  page.evaluate(() => {
    const [a, b] = document.querySelectorAll("audio");
    return {
      lead: Math.round((a?.currentTime ?? 0) * 10) / 10,
      shadow: Math.round((b?.currentTime ?? 0) * 10) / 10,
      duration: Math.round(a?.duration ?? 0),
      playing: a ? !a.paused : false,
    };
  });

const first = await pair();
if (!first.duration) {
  console.error("No audio loaded — put real files in .tracks first; see the header.");
  process.exit(2);
}

const scrub = page.locator('input[type="range"][aria-label="Position in the track"]').first();
if (await scrub.isDisabled()) {
  problems.push("the scrubber is disabled even though the audio has a duration");
}

const forward = page.getByRole("button", { name: "Forward 10 seconds" }).first();
const back = page.getByRole("button", { name: "Back 10 seconds" }).first();

await forward.click();
await page.waitForTimeout(300);
const afterForward = await pair();
console.log("after +10:", JSON.stringify(afterForward));
if (afterForward.lead < 9) problems.push(`+10 did not move the recording (${afterForward.lead}s)`);
if (Math.abs(afterForward.lead - afterForward.shadow) > 1) {
  problems.push("the karaoke half did not follow the sung half");
}

await back.click();
await page.waitForTimeout(300);
const afterBack = await pair();
console.log("after -10:", JSON.stringify(afterBack));
if (afterBack.lead > 1) problems.push(`-10 did not come back (${afterBack.lead}s)`);

// Never past either end.
for (let i = 0; i < 3; i++) await back.click();
await page.waitForTimeout(300);
const clamped = await pair();
console.log("clamped at the start:", JSON.stringify(clamped));
if (clamped.lead < 0) problems.push("went past the start");

// And the scrubber itself moves the audio, keyboard being a real drag's events.
await scrub.focus();
await scrub.press("ArrowRight");
await scrub.press("ArrowRight");
await page.waitForTimeout(400);
const dragged = await pair();
console.log("after two scrubber steps:", JSON.stringify(dragged));
if (dragged.lead === clamped.lead) problems.push("the scrubber did not move the recording");
if (Math.abs(dragged.lead - dragged.shadow) > 1) {
  problems.push("the karaoke half did not follow a scrub");
}

const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
if (overflow > 0) problems.push(`the page scrolls sideways by ${overflow}px`);

await browser.close();

if (problems.length) {
  console.log("\nPROBLEMS:");
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
console.log("\nplayer controls behave");
