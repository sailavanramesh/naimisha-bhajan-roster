/**
 * Report which tanpura recordings are missing.
 *
 * The player is built and wired, but a recording is a file somebody has to
 * make; this says exactly which. Run: npm run check:tanpura
 *
 * Deliberately NOT part of `npm run build`. A missing recording disables one
 * button; it must not be able to stop a deploy that fixes something else.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

// Kept in step with lib/tanpura.ts by scripts/checkTanpuraAssets.test.ts.
const BASE_NOTES = { madhyam: ["c", "d-sharp", "f-sharp", "a"], pancham: ["c", "d-sharp", "f-sharp", "a"] };
const DIR = join(process.cwd(), "public", "audio", "tanpura");

let missing = 0;
for (const [series, notes] of Object.entries(BASE_NOTES)) {
  for (const note of notes) {
    const name = `${series}-${note}.mp3`;
    const path = join(DIR, name);
    if (!existsSync(path)) {
      console.log(`  missing  ${name}`);
      missing++;
    } else {
      const kb = Math.round(statSync(path).size / 1024);
      console.log(`  ok       ${name}  ${kb} KB${kb > 300 ? "  (large for mobile — see README)" : ""}`);
    }
  }
}

if (missing > 0) {
  console.log(`\n${missing} of 8 tanpura recordings missing. The shruti play control will fail on click.`);
  console.log(`See public/audio/tanpura/README.md for what each file must be.`);
} else {
  console.log(`\nAll 8 tanpura recordings present.`);
}
