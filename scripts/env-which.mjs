/**
 * scripts/env-which.mjs — say, out loud, which database each env file points at.
 *
 * The two machines disagree on what `.env` means. On the original Mac it is
 * PRODUCTION and `.env.local` overrides it to dev for `next dev` only; on a
 * laptop bootstrapped by scripts/setup-env.sh, `.env` is dev and there is no
 * `.env.local`. Prisma, tsx and vitest read only `.env`, Next reads both — so
 * "which database am I about to write to" has a different answer per tool.
 *
 * Prints host and database name. Never the password.
 *
 *   npm run env:which
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));

function parse(file) {
  const out = {};
  if (!existsSync(file)) return null;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    out[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

/** postgres://user:pw@host:5432/db?... -> "host/db" */
function describe(url) {
  if (!url) return "(not set)";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

function verdict(desc) {
  if (desc.endsWith("/naimisha")) return "  <-- PRODUCTION. Live group data.";
  if (desc.includes("naimisha_dev")) return "  (dev copy — safe)";
  return "";
}

const files = [".env", ".env.local"];
const parsed = Object.fromEntries(files.map((f) => [f, parse(join(repo, f))]));

for (const f of files) {
  const p = parsed[f];
  if (!p) {
    console.log(`${f.padEnd(12)} (absent)`);
    continue;
  }
  const d = describe(p.DATABASE_URL);
  console.log(`${f.padEnd(12)} ${d}${verdict(d)}`);
}

// The answer that actually matters, per tool.
const envOnly = describe(parsed[".env"]?.DATABASE_URL);
const merged = describe(
  parsed[".env.local"]?.DATABASE_URL ?? parsed[".env"]?.DATABASE_URL,
);

console.log("");
console.log(`next dev / next build       -> ${merged}${verdict(merged)}`);
console.log(`prisma, tsx, vitest         -> ${envOnly}${verdict(envOnly)}`);
if (envOnly !== merged) {
  console.log("");
  console.log("They differ. Prisma and the tests ignore .env.local — pass");
  console.log("DATABASE_URL explicitly for anything that writes.");
}
