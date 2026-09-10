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
#   * it drops and recreates the dev SCHEMA, never the production one
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

DUMP="$(mktemp -t naimisha-prod-XXXXXX.sql)"
trap 'rm -f "$DUMP"' EXIT

echo "Dumping production…"
pg_dump --no-owner --no-privileges --clean --if-exists "$(libpq_url "$PROD_URL")" > "$DUMP"
echo "  $(wc -l < "$DUMP") lines"

# Homebrew ships pg_dump 17; the server is PostgreSQL 16. A newer dumper
# writes settings the older server has never heard of, and psql stops on the
# first one:
#
#   ERROR: unrecognized configuration parameter "transaction_timeout"
#
# Dropped by name rather than by loosening ON_ERROR_STOP, which would hide
# every other error too — and the errors are the reason this is worth running.
sed -i.bak '/^SET transaction_timeout = /d' "$DUMP" && rm -f "$DUMP.bak"

echo "Restoring into dev…"
psql "$(libpq_url "$DEV_URL")" -v ON_ERROR_STOP=1 -q -f "$DUMP"

echo
echo "Done. Dev now matches production as of $(date '+%Y-%m-%d %H:%M')."
echo "Remember: dev now holds real names and real pitches. Treat it accordingly."
