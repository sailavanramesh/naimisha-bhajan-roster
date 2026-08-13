#!/usr/bin/env bash
#
# scripts/fetchFonts.sh — refresh the self-hosted typefaces.
#
# Rarely needed: these files change roughly never, and the whole point of
# holding them here is that a deploy does not depend on fetching them. Run it
# if a weight is added, or if Google reissues the files.
#
# It rewrites the @font-face block at the top of app/globals.css in place,
# keeping only the latin and latin-ext subsets — latin-ext is what carries the
# diacritics in the transliterated Sanskrit, and no other subset is used here.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec python3 scripts/fetchFonts.py "$@"
