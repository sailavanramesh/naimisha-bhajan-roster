/**
 * Does the list come back the way you left it?
 *
 * Drives a real Chrome against `npm run dev` (dev database): filter the list,
 * shut the panel, scroll down, open a bhajan, press Back. Everything should be
 * where it was. Throwaway check for the 2026-09-13 round — see
 * lib/learningListFilter.ts and components/KeepScroll.tsx.
 *
 *   EDITOR_KEY=… MEMBER_KEY=… npm run dev
 *   node scripts/smokeListFilters.mjs <singerId>
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const KEY = process.env.MEMBER_KEY ?? "smoketest-mem";
const id = process.argv[2];

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
const fails = [];
const check = (name, ok, got) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok ? "" : `  — got ${JSON.stringify(got)}`}`);
  if (!ok) fails.push(name);
};

await page.goto(`${BASE}/?k=${KEY}`);
await page.goto(`${BASE}/singers/${id}`, { waitUntil: "networkidle" });

// Filter it down, then shut the panel again.
await page.getByRole("button", { name: /^Filters/ }).click();
await page.getByRole("button", { name: "Ganesha", exact: true }).first().click();
await page.getByRole("button", { name: /^Filters/ }).click();
await page.waitForFunction(() => window.location.search.includes("filters=0"));

const url = page.url();
check("the filter and the shut panel are both in the url", /deity=Ganesha/.test(url) && /filters=0/.test(url), url);

// Get well down the list, then open a bhajan from there.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 900));
await page.waitForTimeout(400);
const before = await page.evaluate(() => window.scrollY);
check("scrolled somewhere worth coming back to", before > 400, before);

await page.getByRole("link", { name: /Ganesha|Vinayaka|Gajanana|Ganapathi/i }).last().click();
await page.waitForURL(/\/bhajans\//, { timeout: 15000 });
await page.goBack({ waitUntil: "networkidle" });
await page.waitForTimeout(900);

check("back lands on the same filtered url", page.url() === url, page.url());
check(
  "the deity chip is still ticked",
  (await page.getByRole("button", { name: /^Filters/ }).innerText()).includes("1"),
  await page.getByRole("button", { name: /^Filters/ }).innerText(),
);
check(
  "the panel is still SHUT",
  (await page.getByRole("button", { name: /^Filters/ }).getAttribute("aria-expanded")) === "false",
  await page.getByRole("button", { name: /^Filters/ }).getAttribute("aria-expanded"),
);
const after = await page.evaluate(() => window.scrollY);
check("and you are back where you were, not at the top", Math.abs(after - before) < 250, { before, after });

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall good");
process.exit(fails.length ? 1 : 0);
