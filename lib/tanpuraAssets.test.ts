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

  it('expects eight recordings, named without a # or a space', () => {
    expect(expected).toHaveLength(8);
    for (const name of expected) expect(name).toMatch(/^(madhyam|pancham)-[a-z-]+\.mp3$/);
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
      .flatMap(([series, notes]) => notes.map((n) => `${series}-${n}.mp3`))
      .sort();
    expect(fromScript).toEqual([...expected].sort());
  });

  it('the README table lists every file, and no file it does not', () => {
    const readme = readFileSync('public/audio/tanpura/README.md', 'utf8');
    const listed = [...readme.matchAll(/`((?:madhyam|pancham)-[a-z-]+\.mp3)`/g)].map((m) => m[1]);
    expect([...new Set(listed)].sort()).toEqual([...expected].sort());
  });
});
