/**
 * A browser smoke test for the roster list view and its paging.
 *
 * The list is the page that keeps being too heavy. It was 5.3MB of session-kind
 * data URLs until 2026-08-31; after that it was 1.28MB of plain markup, because
 * it drew all two hundred sessions at once. Both times the symptom Sailavan
 * reported was the same — it doesn't load on a phone — and neither was visible
 * from types, lint or the unit tests.
 *
 * So this asserts the two things that actually go wrong:
 *
 *   1. the page is not enormous — measured as the transferred bytes of the
 *      document, which is what a phone on one bar is waiting for;
 *   2. it does not scroll sideways at 375px, the assertion from
 *      scripts/smokeMyList.mjs that found the `truncate` bug.
 *
 * and then walks the paging: the foot says how much of the list this is, "show
 * more" draws more, and the search box resets it to the first page.
 *
 * Usage, against a dev server on the DEV database:
 *
 *   REQUIRE_SIGN_IN=false EDITOR_KEY=smoke-editor npx next dev -p 3999 &
 *   node scripts/smokeRosterList.mjs http://localhost:3999 <outDir>
 *
 * Run it against `next dev` and the byte figures are meaningless — development
 * ships unminified React and every chunk separately. The size assertion is
 * skipped unless SMOKE_MEASURE=1 says the target is a real build.
 *
 * It must live inside the repo: run from a scratch directory, `playwright-core`
 * does not resolve.
 */
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3999";
const out = process.argv[3] ?? "/tmp";
const measure = process.env.SMOKE_MEASURE === "1";

/** What the list may weigh, as a built page. The old one was 1.28MB. */
const MAX_DOCUMENT_BYTES = 400_000;

const browser = await chromium.launch({ channel: "chrome" });
const errors = [];

function check(ok, what) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) errors.push(what);
}

const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
await ctx.addCookies([
  { name: "role", value: "editor", url: base },
  { name: "edit", value: "1", url: base },
]);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));

let documentBytes = 0;
page.on("response", async (res) => {
  if (res.url().startsWith(`${base}/roster`) && res.request().resourceType() === "document") {
    try {
      documentBytes = (await res.body()).length;
    } catch {
      /* a redirect has no body; the next response is the one wanted */
    }
  }
});

await page.goto(`${base}/roster?view=list`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}/roster-list-phone.png` });

// 1. Not enormous.
console.log(`document ${documentBytes} bytes`);
if (measure) {
  check(documentBytes > 0 && documentBytes < MAX_DOCUMENT_BYTES, `document under ${MAX_DOCUMENT_BYTES} bytes`);
} else {
  console.log("skip document size — set SMOKE_MEASURE=1 against a built server");
}

// 2. No sideways scroll at 375px. This is the assertion that found `truncate`.
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check(overflow === 0, `no horizontal overflow at 375px (was ${overflow}px)`);

// 3. The foot says how much of the list this is.
const foot = page.locator("#more");
const footText = (await foot.textContent()) ?? "";
console.log(`foot: ${footText.trim()}`);
const shown = /Showing (\d+) of (\d+)/.exec(footText);
check(Boolean(shown), "the foot says how many of how many");

// 4. Show more draws more, and the page comes back at the foot.
if (shown && Number(shown[2]) > Number(shown[1])) {
  const before = Number(shown[1]);
  await page.getByRole("link", { name: /Show \d+ more/ }).click();
  await page.waitForURL(/[?&]n=/);
  await page.locator("#more").waitFor();
  const after = Number(/Showing (\d+) of/.exec((await page.locator("#more").textContent()) ?? "")?.[1]);
  check(after > before, `show more drew more (${before} → ${after})`);

  // 5. A new search starts again at the first page, rather than inheriting the
  //    n of whatever the reader happened to have expanded.
  await page.fill('input[name="q"]', "rama");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.locator("#more").waitFor();
  const url = new URL(page.url());
  check(url.searchParams.get("q") === "rama", "the search reached the URL");
  check(url.searchParams.get("n") === null, "a new search resets to the first page");
} else {
  console.log("skip paging — this database has fewer sessions than one page");
}

await page.screenshot({ path: `${out}/roster-list-more.png` });

await browser.close();

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log("\nall good");
