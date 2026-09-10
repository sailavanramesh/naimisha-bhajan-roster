/**
 * A browser smoke test for the "sung recently" marker on a session.
 *
 * The half that unit tests cannot reach. `tests/recentlySung.test.ts` pins the
 * window arithmetic and the words; what it cannot see is whether the marker
 * actually ARRIVES when somebody picks a bhajan out of the masterlist — which
 * is the whole point of the feature, since a marker that only appears after a
 * save is no use to the person deciding what to sing.
 *
 * It also checks the thing that makes it useful rather than merely decorative:
 * the marker links to the bhajan's own list of dates, and lands ON it.
 *
 * Usage, against a dev server on the DEV database:
 *
 *   REQUIRE_SIGN_IN=false EDITOR_KEY=smoke-editor npx next dev -p 3999 &
 *   node scripts/smokeRecentlySung.mjs http://localhost:3999 <sessionId> [outDir]
 *
 * The session wants at least one bhajan that WAS sung in the three months
 * before it and one that was not, or there is nothing to see. Any session with
 * a repeat will do; the assertions below skip rather than fail when the data
 * has none, because a database with no repeats is not a broken build.
 *
 * It must live inside the repo: run from a scratch directory, `playwright-core`
 * does not resolve.
 */
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3999";
const sessionId = process.argv[3];
const out = process.argv[4] ?? "/tmp";

if (!sessionId) {
  console.error("usage: node scripts/smokeRecentlySung.mjs <base> <sessionId> [outDir]");
  process.exit(2);
}

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

await page.goto(`${base}/roster/${sessionId}`, { waitUntil: "networkidle" });

const markers = page.locator('a[href*="#sung"]');
const before = await markers.count();
console.log(`${before} marker(s) rendered by the server`);

// The phone is where the roster is actually built. This is the assertion from
// scripts/smokeMyList.mjs that caught `truncate`.
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check(overflow === 0, `no horizontal overflow at 375px (was ${overflow}px)`);

if (before === 0) {
  console.log("skip — nothing on this session was sung in the three months before it");
} else {
  const first = markers.first();
  const href = await first.getAttribute("href");
  const title = await first.getAttribute("title");
  check(/^\/bhajans\/.+#sung$/.test(href ?? ""), `links to the dates (${href})`);
  check(Boolean(title && /sung/i.test(title)), "says when and how often in its title");

  // The destination exists and is the table of dates — a link to an anchor that
  // is not there scrolls nowhere and looks like a broken page.
  await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
  const target = page.locator("#sung");
  check((await target.count()) === 1, "#sung is on the bhajan page");
  check(
    ((await target.textContent()) ?? "").includes("Who has sung this"),
    "#sung is the list of dates",
  );

  await page.screenshot({ path: `${out}/recently-sung-target.png` });
  await page.goBack({ waitUntil: "networkidle" });
}

/*
 * THE LIVE PATH. Retype a bhajan that was sung recently into a row and the
 * marker must appear without saving anything — this is what the effect
 * watching the rows' bhajan ids is for, and it is the part that silently
 * breaks when a new way of putting a bhajan on a row gets added.
 *
 * Nothing is saved: the grid keeps edits in state until "Save changes", so the
 * database is untouched by this.
 */
if (before > 0) {
  const inputs = page.locator('input[placeholder="Search masterlist…"]');
  const rowCount = await inputs.count();

  // A row that has no marker yet, so an appearing one is unambiguous.
  let target = -1;
  for (let i = 0; i < rowCount; i += 1) {
    const cell = page.locator("td[data-label='Bhajan']").nth(i);
    if ((await cell.locator('a[href*="#sung"]').count()) === 0) {
      target = i;
      break;
    }
  }

  if (target === -1) {
    console.log("skip live pick — every row already carries a marker");
  } else {
    const known = (await markers.first().evaluate((a) => a.closest("td")?.querySelector("input")?.value)) ?? "";
    const box = inputs.nth(target);
    await box.click();
    await box.fill("");
    await box.type(known.slice(0, 18), { delay: 20 });

    const option = page.locator("#bhajan-suggestions li, #bhajan-suggestions button").first();
    await option.waitFor({ timeout: 5000 });
    await option.click();

    await page.waitForFunction(
      (n) => document.querySelectorAll('a[href*="#sung"]').length > n,
      before,
      { timeout: 5000 },
    ).catch(() => {});

    const after = await markers.count();
    check(after > before, `the marker arrives with the bhajan (${before} → ${after})`);
    await page.screenshot({ path: `${out}/recently-sung-picked.png` });
  }
}

await browser.close();

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log("\nall good");
