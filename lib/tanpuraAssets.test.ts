import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { allTanpuraSrcs } from './tanpura';

/**
 * scripts/checkTanpuraAssets.mjs repeats the base-note list, because it runs as
 * plain node with no TypeScript loader and cannot import lib/tanpura.ts. That
 * duplication is only safe if something notices when the two drift — which is
 * this. The README's table is checked the same way, since a stale table would
 * have somebody record the wrong pitches.
 */
describe('tanpura asset list stays in step', () => {
  const expected = allTanpuraSrcs().map((src) => src.split('/').pop()!);

  it('expects six recordings, named without a # or a space', () => {
    expect(expected).toHaveLength(6);
    for (const name of expected) expect(name).toMatch(/^(madhyam|pancham)-[a-z-]+\.wav$/);
  });

  it('the check script names exactly the files the app requests', () => {
    const script = readFileSync('scripts/checkTanpuraAssets.mjs', 'utf8');
    const m = /const BASE_NOTES = (\{[^;]*\});/.exec(script);
    expect(m, 'BASE_NOTES not found in checkTanpuraAssets.mjs').not.toBeNull();

    // The literal is JSON-shaped apart from unquoted keys and single-run
    // whitespace, so normalise the keys rather than eval the script.
    const json = m![1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"');
    const parsed = JSON.parse(json) as Record<string, string[]>;

    const fromScript = Object.entries(parsed)
      .flatMap(([series, notes]) => notes.map((n) => `${series}-${n}.wav`))
      .sort();
    expect(fromScript).toEqual([...expected].sort());
  });

  it('the README table lists every file, and no file it does not', () => {
    const readme = readFileSync('public/audio/tanpura/README.md', 'utf8');
    const listed = [...readme.matchAll(/`((?:madhyam|pancham)-[a-z-]+\.wav)`/g)].map((m) => m[1]);
    expect([...new Set(listed)].sort()).toEqual([...expected].sort());
  });
});

/**
 * The recordings are CC BY 4.0, which requires the credit to be present
 * wherever they are used. A test, because a licence condition that depends on
 * nobody tidying away a footer is not a condition that will hold.
 */
describe('the CC BY credit', () => {
  const layout = readFileSync('app/layout.tsx', 'utf8');

  it('names the author, the source and the licence', () => {
    expect(layout).toContain('freesound.org/people/sankalp');
    expect(layout).toContain('creativecommons.org/licenses/by/4.0');
    expect(layout).toMatch(/CC BY 4\.0/);
  });

  it('is rendered on every page, not on one that can be edited away', () => {
    expect(layout).toMatch(/<footer/);
  });
});
