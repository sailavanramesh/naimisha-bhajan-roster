/**
 * A browser smoke test for the list — /my-list and the same component on a
 * singer's page. Run it before shipping a change to LearningListView.
 *
 * It exists because of the bug it caught. The title span carried `truncate`,
 * which is `white-space: nowrap`, so its min-content was the width of the whole
 * title — and a card is a grid item, so one long bhajan name set the minimum
 * width of the grid, the page, and every other card on it. The singer page laid
 * out at 569px inside a 375px phone and scrolled sideways. Types, lint and the
 * unit tests were all clean; the bug only exists once a browser is laying it
 * out. Hence the horizontal-overflow assertion below, which is the whole point.
 *
 * Usage, against a dev server on the DEV database (see .env.local):
 *
 *   REQUIRE_SIGN_IN=false EDITOR_KEY=smoke-editor npx next dev -p 3999 &
 *   node scripts/smokeMyList.mjs http://localhost:3999 <singerId> <outDir>
 *
 * It must live inside the repo: run from a scratch directory, `playwright-core`
 * does not resolve.
 */
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3999";
const singerId = process.argv[3];
const out = process.argv[4] ?? "/tmp";

const browser = await chromium.launch({ channel: "chrome" });
const errors = [];

async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log(`shot ${name}`);
}

for (const [name, width, height] of [
  ["phone", 375, 900],
  ["desk", 1100, 900],
]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${name}] console: ${m.text()}`);
  });

  await page.goto(`${base}/?k=${process.env.EDITOR_KEY ?? "smoke-editor"}`, {
    waitUntil: "domcontentloaded",
  });
  await page.goto(`${base}/singers/${singerId}`, { waitUntil: "networkidle" });

  const listTop = page.locator("#list");
  await listTop.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, `${name}-list`);

  // The search box must narrow the list without a reload.
  const search = page.locator("#list-search");
  const before = await page.locator("#list li").count();
  await search.fill("ram");
  await page.waitForTimeout(250);
  const after = await page.locator("#list li").count();
  console.log(`${name}: ${before} rows -> ${after} matching "ram"`);
  await shot(page, `${name}-search`);
  await search.fill("");

  // Filters panel opens and carries every group.
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.waitForTimeout(250);
  await shot(page, `${name}-filters`);

  // THE PAGE MUST NOT SCROLL SIDEWAYS. A <select> takes its intrinsic width
  // from its widest option, and a raga name is wider than a phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log(`${name}: horizontal overflow ${overflow}px`);
  if (overflow > 0) errors.push(`[${name}] page scrolls sideways by ${overflow}px`);

  // Multi-select, and the two modes. Only(a) + Only(b) must widen, and Except
  // must be the complement over rows that HAVE a deity — the blank ones stay.
  const total = await page.locator("#list li").count();
  // Named individually: a selected chip gains a tick, so an index into a
  // text-matched list moves under you after the first click.
  const krishna = page.locator("button").filter({ hasText: /^\u2713?\s*Krishna$/ }).first();
  const rama = page.locator("button").filter({ hasText: /^\u2713?\s*Rama$/ }).first();
  const deityChips = { nth: (i) => (i === 0 ? krishna : rama), count: async () => ((await krishna.count()) && (await rama.count()) ? 2 : 0) };
  if ((await deityChips.count()) >= 2) {
    await deityChips.nth(0).click();
    await page.waitForTimeout(200);
    const one = await page.locator("#list li").count();
    await deityChips.nth(1).click();
    await page.waitForTimeout(200);
    const two = await page.locator("#list li").count();
    console.log(`${name}: one deity ${one} rows, two deities ${two} rows`);
    if (two < one) errors.push(`[${name}] adding a second deity NARROWED the list (${one} -> ${two})`);

    await page.getByRole("button", { name: "Except" }).first().click();
    await page.waitForTimeout(200);
    const excluded = await page.locator("#list li").count();
    console.log(`${name}: except those two -> ${excluded} rows (of ${total})`);
    if (excluded + two !== total) {
      errors.push(`[${name}] Only(${two}) + Except(${excluded}) != ${total}`);
    }
    await page.getByRole("button", { name: "Only" }).first().click();
    await deityChips.nth(0).click();
    await deityChips.nth(1).click();
    await page.waitForTimeout(200);
  } else {
    console.log(`${name}: no Krishna/Rama chips to exercise the modes with`);
  }

  // A stage chip narrows it.
  await page.getByRole("button", { name: /^Learning/ }).first().click();
  await page.waitForTimeout(250);
  const staged = await page.locator("#list li").count();
  console.log(`${name}: Learning chip -> ${staged} rows`);
  await shot(page, `${name}-stage`);

  await ctx.close();
}

await browser.close();
if (errors.length) {
  console.log("\nBROWSER ERRORS:");
  for (const e of errors) console.log("  " + e);
  process.exit(1);
}
console.log("\nno browser errors");
