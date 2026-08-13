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
#   * it refuses outright if the target is not named *_dev
#   * it drops and recreates the dev SCHEMA, never the production one
#
# There is deliberately no --reverse flag. Promoting data upwards is not a
# thing this project does; code is promoted, data is not.

set -euo pipefail

APPLY="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Read the production URL from .env without printing it.
PROD_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [ -z "$PROD_URL" ]; then
  echo "No DATABASE_URL in .env — nothing to copy from." >&2
  exit 1
fi

DEV_URL="${PROD_URL/\/naimisha?//naimisha_dev?}"

# The guard that matters. If the swap did not happen, the two are identical
# and this would dump production onto itself.
if [ "$DEV_URL" = "$PROD_URL" ]; then
  echo "Refusing: the dev URL is identical to production. Check the database name." >&2
  exit 1
fi
case "$DEV_URL" in
  *"/naimisha_dev?"*) ;;
  *) echo "Refusing: the target is not a *_dev database." >&2; exit 1 ;;
esac

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
pg_dump --no-owner --no-privileges --clean --if-exists "$PROD_URL" > "$DUMP"
echo "  $(wc -l < "$DUMP") lines"

echo "Restoring into dev…"
psql "$DEV_URL" -v ON_ERROR_STOP=1 -q -f "$DUMP"

echo
echo "Done. Dev now matches production as of $(date '+%Y-%m-%d %H:%M')."
echo "Remember: dev now holds real names and real pitches. Treat it accordingly."
