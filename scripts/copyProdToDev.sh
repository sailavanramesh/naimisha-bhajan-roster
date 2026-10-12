#!/usr/bin/env bash
#
# scripts/copyProdToDev.sh — refresh the dev database from production.
#
#   ./scripts/copyProdToDev.sh            # report what it would do
#   ./scripts/copyProdToDev.sh --apply    # do it
#
# ONE DIRECTION, ALWAYS. Production is the only copy of the 709 confirmed
# pitches; dev is disposable. Everything below is arranged so that a mistake
# destroys the disposable one:
#
#   * the source and target are derived, not typed — the target is the source
#     with the database name swapped, so they cannot be transposed by accident
#   * the source is checked to be the production database whatever machine it
#     came from — .env here, the app service on a bootstrapped one
#   * it refuses outright if the target is not named *_dev
#   * it drops and recreates the dev TABLES, never the production ones
#
# There is deliberately no --reverse flag. Promoting data upwards is not a
# thing this project does; code is promoted, data is not.

set -euo pipefail

APPLY="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# WHERE THE SOURCE COMES FROM
#
# The two machines disagree about .env (docs/SETUP.md has the table). On the
# original Mac .env *is* production. On anything built by setup-env.sh, .env is
# dev and the production string is not on disk at all — so it is read back from
# the production app service for the length of this run, and never written down.
ENV_URL=""
if [ -f "$ROOT/.env" ]; then
  ENV_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi

# The database a URL names: after the last "/", before any "?".
db_name() { local base="${1%%\?*}"; echo "${base##*/}"; }

# A connection string libpq will accept.
#
# Prisma's URL carries pool settings that libpq has never heard of, and it
# STOPS rather than ignoring them:
#
#   pg_dump: error: invalid URI query parameter: "connection_limit"
#
# On the original Mac this never came up, because .env there IS production and
# holds a bare URL. It only appears on the setup-env.sh path, where the string
# is read back from the app service — which is where the pool settings live.
#
# Dropped by name, so anything libpq does understand (sslmode above all, and
# this server requires it) still gets through.
libpq_url() {
  local url="$1"
  local base="${url%%\?*}"
  local query="${url#"$base"}"
  query="${query#\?}"
  if [ -z "$query" ]; then echo "$base"; return; fi

  local keep="" pair
  local IFS='&'
  for pair in $query; do
    case "${pair%%=*}" in
      connection_limit|pool_timeout|pgbouncer|schema|socket_timeout|statement_cache_size) ;;
      *) keep="${keep:+$keep&}$pair" ;;
    esac
  done
  echo "${base}${keep:+?$keep}"
}

case "$(db_name "$ENV_URL")" in
  naimisha)
    PROD_URL="$ENV_URL"
    ;;
  *)
    if [ -n "$ENV_URL" ]; then
      echo "This machine's .env points at \"$(db_name "$ENV_URL")\", not production."
    else
      echo "This machine's .env has no DATABASE_URL."
    fi
    echo "Reading the production connection string from the app service instead;"
    echo "it lives in this shell only and is never written to disk."
    echo
    PROD_URL="$(bash "$ROOT/scripts/setup-env.sh" --print-prod-db)"
    ;;
esac

if [ "$(db_name "$PROD_URL")" != "naimisha" ]; then
  echo "Refusing: the source is not the production database." >&2
  exit 1
fi

# The target is derived by renaming the database in the source, so the two
# cannot be transposed. Written as an explicit split rather than a pattern
# substitution: "?" is a glob character, and the obvious
# ${PROD_URL/\/naimisha?/...} also matched "/naimisha_", which turned a dev URL
# into "naimisha_devdev" on any machine whose .env was not production.
BASE="${PROD_URL%%\?*}"      # everything before the query string
QUERY="${PROD_URL#"$BASE"}"  # "?sslmode=require", or nothing
DEV_URL="${BASE}_dev${QUERY}"

# The guard that matters. If the rename did not happen, the two are identical
# and this would dump production onto itself.
if [ "$DEV_URL" = "$PROD_URL" ]; then
  echo "Refusing: the dev URL is identical to production. Check the database name." >&2
  exit 1
fi
if [ "$(db_name "$DEV_URL")" != "naimisha_dev" ]; then
  echo "Refusing: the target is not a *_dev database." >&2
  exit 1
fi

echo "  from  production  (naimisha)"
echo "  to    development (naimisha_dev)"
echo

if [ "$APPLY" != "--apply" ]; then
  echo "Dry run. Nothing was read or written."
  echo "Re-run with --apply to replace the dev database with a copy of production."
  exit 0
fi

# pg_dump is not on the PATH of a stock Mac, and Homebrew keeps libpq out of
# it on purpose. Look where it actually lives before giving up.
PG_BIN=""
for candidate in \
  "$(command -v pg_dump 2>/dev/null || true)" \
  /opt/homebrew/opt/libpq/bin/pg_dump \
  /usr/local/opt/libpq/bin/pg_dump \
  /Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then PG_BIN="$(dirname "$candidate")"; break; fi
done

if [ -z "$PG_BIN" ]; then
  cat >&2 <<'MISSING'
pg_dump and psql are not installed.

  brew install libpq

Homebrew does not put them on the PATH; this script looks in its usual
location, so an install is all that is needed.
MISSING
  exit 1
fi
export PATH="$PG_BIN:$PATH"

WORK="$(mktemp -d -t naimisha-prod-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

# THREE DUMPS, NOT ONE
#
# The restore used to be a single `psql -f` of a single dump. It hung, every
# time, at "Restoring into dev…" — a COPY into Bhajan with the server waiting
# on ClientRead and megabytes sitting unsent in the Mac's socket buffer.
# Uploads from the original Mac to this server freeze at random somewhere
# between 1 and 4 MB, on home wifi and on a phone hotspot alike, with or
# without NordVPN's filter. Downloads never do, so dumping is safe; it is the
# 11 MB of bhajans going back up that dies.
#
# So the restore is built to survive it: tables first with no keys
# (pre-data), then the rows in small pieces, then the keys and indexes
# (post-data). Splitting off the keys is what lets the rows go in any order.
echo "Dumping production…"
for section in pre-data data post-data; do
  extra=""
  [ "$section" = "pre-data" ] && extra="--clean --if-exists"
  # shellcheck disable=SC2086
  pg_dump --no-owner --no-privileges --section="$section" $extra "$(libpq_url "$PROD_URL")" > "$WORK/$section.sql"
  # Homebrew ships pg_dump 17; the server is PostgreSQL 16. A newer dumper
  # writes settings the older server has never heard of, and psql stops on
  # the first one:
  #
  #   ERROR: unrecognized configuration parameter "transaction_timeout"
  #
  # Dropped by name rather than by loosening ON_ERROR_STOP, which would hide
  # every other error too — and the errors are the reason this is worth running.
  sed -i.bak '/^SET transaction_timeout = /d' "$WORK/$section.sql" && rm -f "$WORK/$section.sql.bak"
done
echo "  $(wc -c < "$WORK/data.sql" | awk '{printf "%.1f MB", $1/1048576}') of rows"

# THE RESTORE
#
# Every upload is small (CHUNK bytes of COPY rows), runs in its own
# transaction (psql -1), and is killed if it has not finished in PIECE_TIMEOUT
# seconds. A killed piece rolls back, so retrying it cannot duplicate a row.
# The server does not notice the dead client for a long while, so its session
# is ended by name (PGAPPNAME) before the retry — otherwise it holds a lock
# that the post-data ALTER TABLEs would wait on forever.
#
# In COPY text format a row is exactly one line (newlines inside values are
# written as \n), which is what makes splitting on lines safe.
echo "Restoring into dev…"
DEV_LIBPQ="$(libpq_url "$DEV_URL")" WORK="$WORK" python3 - <<'PY'
import os, re, subprocess, sys, time

DEV, WORK = os.environ["DEV_LIBPQ"], os.environ["WORK"]
APP = "copyProdToDev"
CHUNK = 256 * 1024
PIECE_TIMEOUT = 30
TRIES = 8
os.environ.setdefault("PGCONNECT_TIMEOUT", "15")

def psql(url, *args, inp=None, timeout=60):
    env = dict(os.environ, PGAPPNAME=APP)
    return subprocess.run(["psql", url, *args], input=inp, capture_output=True, timeout=timeout, env=env)

def reap():
    psql(DEV, "-Atc", "select pg_terminate_backend(pid) from pg_stat_activity "
         f"where datname = current_database() and application_name = '{APP}' and pid <> pg_backend_pid()")

def upload(sql, label, timeout=PIECE_TIMEOUT):
    for attempt in range(1, TRIES + 1):
        try:
            r = psql(DEV, "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", "-", inp=sql, timeout=timeout)
        except subprocess.TimeoutExpired:
            print(f"    {label}: stalled, retrying ({attempt}/{TRIES})", flush=True)
            reap()
            continue
        if r.returncode == 0:
            return
        err = r.stderr.decode(errors="replace").strip()
        # psql exits 2 when the connection itself failed; 3 is a real SQL error.
        if r.returncode == 2:
            print(f"    {label}: connection lost, retrying ({attempt}/{TRIES})", flush=True)
            reap(); time.sleep(2)
            continue
        sys.exit(f"{label} failed:\n{err}")
    sys.exit(f"{label}: still stalling after {TRIES} tries — giving up. Dev is half-restored; run this again.")

read = lambda name: open(os.path.join(WORK, name), "rb").read()
pre, data, post = read("pre-data.sql"), read("data.sql"), read("post-data.sql")

reap()
# pre-data's own DROPs cannot clear a table another table's foreign key still
# points at, so every dev table goes first, CASCADE. This is the dev database:
# the bash above refuses to get here with anything else.
upload(b"""DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
  END LOOP; END $$;""", "clearing dev")
upload(pre, "tables")

counts = {}
for m in re.finditer(rb"(?ms)^(COPY public\.(\S+) \(.*?\) FROM stdin;)\n(.*?)^\\\.\n", data):
    header, table, rows = m.group(1), m.group(2).decode().strip('"'), m.group(3).splitlines(keepends=True)
    counts[table] = len(rows)
    pieces, piece, size = [], [], 0
    for row in rows:
        piece.append(row); size += len(row)
        if size >= CHUNK:
            pieces.append(piece); piece, size = [], 0
    if piece:
        pieces.append(piece)
    if len(pieces) > 1:
        print(f"  {table}: {len(rows)} rows in {len(pieces)} pieces", flush=True)
    for i, p in enumerate(pieces, 1):
        upload(header + b"\n" + b"".join(p) + b"\\.\n", f"{table} {i}/{len(pieces)}")

setvals = b"".join(re.findall(rb"(?m)^SELECT pg_catalog\.setval\(.*\n", data))
if setvals:
    upload(setvals, "sequences")

reap()
upload(post, "keys and indexes", timeout=180)

# Proof, not hope: every table's row count against production's.
bad = []
for table, n in counts.items():
    got = psql(DEV, "-Atc", f'select count(*) from public."{table}"').stdout.decode().strip()
    if got != str(n):
        bad.append(f"{table}: production {n}, dev {got}")
if bad:
    sys.exit("Row counts differ:\n  " + "\n  ".join(bad))
print(f"  {len(counts)} tables, row counts match production")
PY

echo
echo "Done. Dev now matches production as of $(date '+%Y-%m-%d %H:%M')."
echo "Remember: dev now holds real names and real pitches. Treat it accordingly."
