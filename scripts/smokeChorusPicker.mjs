/**
 * A browser smoke test for choosing chorus mics several at a time.
 *
 * **THIS ONE WRITES TO THE DATABASE.** Every other smoke script in here only
 * reads; chorus mics save on their own the moment they are chosen — they never
 * go through the grid's Save — so there is no way to exercise the picker
 * without real rows being created. It takes everybody it added back off again
 * in a `finally`, so an assertion failing midway still leaves the session as it
 * was. Point it at the DEV database and nothing else.
 *
 * What it covers that unit tests cannot: the picker is a portalled popover over
 * a server action, and the interesting parts are all in the seam — that ticking
 * three names produces ONE write rather than three, that the cushion dots
 * appear ready to allocate afterwards (which is the half of Sailavan's request
 * that comes second), and that the confirmation does not go stale.
 *
 * Usage, against a dev server on the DEV database:
 *
 *   REQUIRE_SIGN_IN=false EDITOR_KEY=smoke-editor npx next dev -p 3999 &
 *   node scripts/smokeChorusPicker.mjs http://localhost:3999 <sessionId> [outDir]
 *
 * It must live inside the repo: run from a scratch directory, `playwright-core`
 * does not resolve.
 */
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3999";
const sessionId = process.argv[3];
const out = process.argv[4] ?? "/tmp";

if (!sessionId) {
  console.error("usage: node scripts/smokeChorusPicker.mjs <base> <sessionId> [outDir]");
  process.exit(2);
}

const HOW_MANY = 3;

const browser = await chromium.launch({ channel: "chrome" });
const errors = [];

function check(ok, what) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) errors.push(what);
}

// 375px: the roster gets built on a phone, standing up, in a hall.
const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
await ctx.addCookies([
  { name: "role", value: "editor", url: base },
  { name: "edit", value: "1", url: base },
]);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));

let cell = null;

try {
  await page.goto(`${base}/roster/${sessionId}`, { waitUntil: "networkidle" });

  const trigger = page.locator('button:has-text("+ chorus mic")').first();
  if ((await trigger.count()) === 0) {
    console.log("skip — every row on this session already has chorus mics");
  } else {
    cell = page.locator("td[data-label='Chorus mics']").first();

    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    const panel = page.locator('[role="dialog"][aria-label="Choose who is on the chorus mics"]');
    await panel.waitFor({ timeout: 5000 });

    check(
      (await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )) === 0,
      "the panel does not push the page sideways at 375px",
    );

    const rowHeight = (await panel.locator("label").first().boundingBox())?.height ?? 0;
    check(rowHeight >= 32, `a name is a real tap target (${Math.round(rowHeight)}px)`);

    const add = panel.locator('button:has-text("Add")');
    check(await add.isDisabled(), "Add does nothing until somebody is ticked");

    const boxes = panel.locator('input[type="checkbox"]');
    const offered = await boxes.count();
    if (offered < HOW_MANY) {
      console.log(`skip — only ${offered} people free on this row`);
    } else {
      const names = [];
      for (let i = 0; i < HOW_MANY; i += 1) {
        names.push(((await panel.locator("label").nth(i).textContent()) ?? "").trim());
        await boxes.nth(i).check();
      }
      check(
        ((await add.textContent()) ?? "").includes(String(HOW_MANY)),
        `Add counts the ticks (${(await add.textContent())?.trim()})`,
      );
      await page.screenshot({ path: `${out}/chorus-picker.png` });

      // ONE write for all three — the whole point of the change.
      const writes = [];
      page.on("response", (r) => {
        if (r.url().includes(`/roster/${sessionId}`) && r.request().method() === "POST") {
          writes.push(r.url());
        }
      });
      await add.click();

      for (const n of names) {
        await cell.locator(`text=${n}`).first().waitFor({ timeout: 8000 });
      }
      check(true, `all ${HOW_MANY} arrived: ${names.join(", ")}`);
      check(writes.length === 1, `in one write, not ${HOW_MANY} (${writes.length})`);

      // The second half of the request: the cushions are now there to allocate.
      const dots = cell.locator('button[aria-label*="chorus cushion"]');
      const dotCount = await dots.count();
      check(
        dotCount >= HOW_MANY,
        `each of them has cushions to pick from (${dotCount} dots)`,
      );
      /*
       * WAITED FOR, not asserted on the spot. The note only appears once the
       * transition settles — until then the cell says "Saving…" — and the
       * names land a beat earlier, so reading the text straight after them is
       * a race the test loses about half the time.
       */
      const saidNext = await page
        .waitForFunction(
          () =>
            document
              .querySelector("td[data-label='Chorus mics']")
              ?.textContent?.includes("now pick their cushions") ?? false,
          undefined,
          { timeout: 8000 },
        )
        .then(() => true)
        .catch(() => false);
      check(saidNext, "and the cell says that is the next step");
      await page.screenshot({ path: `${out}/chorus-added.png` });

      const first = dots.first();
      await first.click();
      await page.waitForFunction(
        (label) =>
          document
            .querySelector(`button[aria-label="${label}"]`)
            ?.getAttribute("aria-pressed") === "true",
        await first.getAttribute("aria-label"),
        { timeout: 8000 },
      );
      check(true, "a cushion sticks");

      /*
       * The note must not outlive what it describes. "Added 3 · now pick their
       * cushions" sitting over a removal was a real bug in the first cut — the
       * same shape as the copy-down sentence that used to describe a session
       * that no longer existed.
       */
      await cell.locator('button[aria-label^="Take "]').first().click();
      await page.waitForFunction(
        () =>
          !(
            document
              .querySelector("td[data-label='Chorus mics']")
              ?.textContent?.includes("now pick their cushions") ?? true
          ),
        undefined,
        { timeout: 8000 },
      );
      check(true, "the confirmation does not outlive what it described");
    }
  }
} finally {
  // Put the session back. Best effort, and loud if it cannot.
  if (cell) {
    for (let i = 0; i < 10; i += 1) {
      const x = cell.locator('button[aria-label^="Take "]').first();
      if ((await x.count()) === 0) break;
      await x.click().catch(() => {});
      await page.waitForTimeout(900);
    }
    const left = await cell.locator('button[aria-label^="Take "]').count();
    if (left > 0) {
      console.error(`\nCLEANUP INCOMPLETE — ${left} chorus mic(s) left on ${sessionId}`);
      errors.push("cleanup incomplete");
    } else {
      console.log("cleaned up — the session is as it was");
    }
  }
  await browser.close();
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log("\nall good");
