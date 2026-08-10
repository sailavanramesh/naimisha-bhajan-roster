/**
 * scripts/verifyMicCushions.mjs — live two-device proof for mic cushions.
 *
 * The merge logic has unit tests (tests/micCushion.test.ts), but those cannot
 * show that two real browsers converge against a real server and database.
 * This drives two independent browser contexts and asserts the properties that
 * actually matter on a sound desk:
 *
 *   1. a change on one device reaches the other
 *   2. the cushion follows the SINGER across all their slots
 *   3. simultaneous writes to DIFFERENT singers never clobber each other
 *   4. clearing propagates as well as setting
 *   5. it is persisted, not just held in memory
 *
 * Requires a running server and Chrome. Not part of `npx vitest run` — it needs
 * a browser and mutates data, so it is run deliberately:
 *
 *   node scripts/verifyMicCushions.mjs <baseUrl> <editorKey> <sessionId> <singerA> <singerB>
 *
 * Pick a session where one singer appears twice, or assertion 2 is vacuous.
 */
import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [BASE, KEY, SESSION, A, B] = process.argv.slice(2);
const url = `${BASE}/roster/${SESSION}?k=${KEY}`;

async function setColour(page, singerId, label) {
  await page.evaluate(([sid, lbl]) => {
    const tr = [...document.querySelectorAll('tr')].find(t => { const s = t.querySelector('select'); return s && s.value === sid; });
    tr.querySelector(`button[aria-label="${lbl} mic cushion"]`).click();
  }, [singerId, label]);
}
async function readColour(page, singerId) {
  return page.evaluate((sid) => {
    const tr = [...document.querySelectorAll('tr')].find(t => { const s = t.querySelector('select'); return s && s.value === sid; });
    if (!tr) return 'NO_ROW';
    const on = tr.querySelector('button[aria-pressed="true"]');
    return on ? on.getAttribute('aria-label').replace(' mic cushion','') : 'none';
  }, singerId);
}
async function countPressed(page, singerId) {
  return page.evaluate((sid) => [...document.querySelectorAll('tr')]
    .filter(t => { const s = t.querySelector('select'); return s && s.value === sid; })
    .filter(t => t.querySelector('button[aria-pressed="true"]')).length, singerId);
}
async function waitFor(page, singerId, expected, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await readColour(page, singerId) === expected) return Date.now() - t0;
    await page.waitForTimeout(400);
  }
  return -1;
}

const b = await chromium.launch({ executablePath: CHROME });
const pageA = await (await b.newContext()).newPage();
const pageB = await (await b.newContext()).newPage();
await pageA.goto(url, { waitUntil: 'networkidle' });
await pageB.goto(url, { waitUntil: 'networkidle' });

// Normalise: the toggle clears when you tap the active colour, so a leftover
// colour from a previous run would make a set look like a clear.
for (const sid of [A, B]) {
  const cur = await readColour(pageA, sid);
  if (cur !== 'none') { await setColour(pageA, sid, cur); await pageA.waitForTimeout(600); }
}
await pageB.reload({ waitUntil: 'networkidle' });
await pageA.waitForTimeout(1200);
console.log('reset:', await readColour(pageA, A), await readColour(pageA, B));

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

console.log('\n1. A sets Pink -> does B see it?');
await setColour(pageA, A, 'Pink');
ok(await readColour(pageA, A) === 'Pink', 'A shows Pink immediately (optimistic)');
const t = await waitFor(pageB, A, 'Pink');
ok(t >= 0, `B sees Pink after ${t}ms (propagation)`);

console.log('\n2. does the cushion follow the singer across both their slots?');
const n = await countPressed(pageA, A);
ok(n === 2, `singer has ${n} rows showing the cushion (expected 2 — sings twice)`);

console.log('\n3. simultaneous writes to DIFFERENT singers — neither may clobber');
await Promise.all([setColour(pageA, A, 'Blue'), setColour(pageB, B, 'Orange')]);
await pageA.waitForTimeout(7000); await pageB.waitForTimeout(500);
const a1 = await readColour(pageA, A), a2 = await readColour(pageA, B);
const b1 = await readColour(pageB, A), b2 = await readColour(pageB, B);
ok(a1 === 'Blue' && a2 === 'Orange', `A converged: singerA=${a1} singerB=${a2}`);
ok(b1 === 'Blue' && b2 === 'Orange', `B converged: singerA=${b1} singerB=${b2}`);

console.log('\n4. clearing propagates');
await setColour(pageA, A, 'Blue');
ok(await readColour(pageA, A) === 'none', 'A cleared (tapping the active colour toggles off)');
const t2 = await waitFor(pageB, A, 'none');
ok(t2 >= 0, `B sees it cleared after ${t2}ms`);

console.log('\n5. reload keeps it (persisted, not just in memory)');
await setColour(pageA, A, 'Grey');
await pageA.waitForTimeout(2000);
await pageA.reload({ waitUntil: 'networkidle' });
const t3 = await waitFor(pageA, A, 'Grey');
ok(t3 >= 0, `still Grey after reload (${t3}ms)`);

console.log(fails === 0 ? '\n>>> ALL PASS' : `\n>>> ${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
