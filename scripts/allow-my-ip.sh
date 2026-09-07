#!/usr/bin/env bash
#
# scripts/allow-my-ip.sh — let THIS machine, on THIS network, reach the database.
#
# `psql-naimisha-roster` accepts connections from Azure itself and from a short
# list of named IPs, nothing else. That is why the app works but a laptop on a
# hotel or cafe network sees the connection hang and then fail — nothing in the
# app says "firewall", it just cannot connect.
#
# The rule is named after the machine, not the network, and the script rewrites
# its address rather than adding another. Move to a new wifi, run it again, and
# you still have exactly one rule. That matters: a rule per cafe would quietly
# leave a trail of stale addresses permanently allowed at the database.
#
#   bash scripts/allow-my-ip.sh            # allow this machine's current IP
#   bash scripts/allow-my-ip.sh --remove   # withdraw it (do this when you leave)
#   bash scripts/allow-my-ip.sh --list     # show every rule on the server
#
set -euo pipefail

RG="rg-naimisha-bhajan-roster"
SERVER="psql-naimisha-roster"

# One stable rule per machine. Azure allows letters, digits and hyphens.
MACHINE="$(scutil --get ComputerName 2>/dev/null || hostname -s)"
RULE="dev-$(echo "$MACHINE" | tr -cd '[:alnum:]-' | cut -c1-40)"

if ! az account show >/dev/null 2>&1; then
  echo "Not signed in to Azure. Run:  az login" >&2
  exit 1
fi

case "${1-}" in
  --list)
    az postgres flexible-server firewall-rule list \
      --resource-group "$RG" --server-name "$SERVER" -o table
    exit 0
    ;;
  --remove)
    az postgres flexible-server firewall-rule delete \
      --resource-group "$RG" --server-name "$SERVER" --name "$RULE" --yes
    echo "removed $RULE"
    exit 0
    ;;
  "") ;;
  *) echo "unknown argument: $1" >&2; exit 2 ;;
esac

IP="$(curl -fsS https://api.ipify.org)"
if ! [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "could not determine this machine's public IP (got: $IP)" >&2
  exit 1
fi

echo "$MACHINE is at $IP — setting rule $RULE"
az postgres flexible-server firewall-rule create \
  --resource-group "$RG" --server-name "$SERVER" --name "$RULE" \
  --start-ip-address "$IP" --end-ip-address "$IP" -o none

echo "done. Remember: bash scripts/allow-my-ip.sh --remove when you leave this network."
