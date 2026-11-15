#!/usr/bin/env bash
# Start the demo: backend (:4000) + frontend (:5173), with demo data loaded.
# Usage:  ./run.sh            normal demo run
#         ./run.sh --reseed   wipe and reload the demo data first
# Stop with Ctrl-C.
set -euo pipefail
cd "$(dirname "$0")"

# Optional settings (API keys etc.) from a .env file next to this script — never committed.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

command -v node >/dev/null || { echo "Node.js 18+ is required (https://nodejs.org)"; exit 1; }

for port in 4000 5173; do
  lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null || true
done

[ -d server/node_modules ] || (echo "Installing backend dependencies…"  && npm --prefix server install --silent)
[ -d web/node_modules ]    || (echo "Installing frontend dependencies…" && npm --prefix web install --silent)

if [ "${1:-}" = "--reseed" ] || [ ! -f server/data/requests.json ]; then
  npm --prefix server run seed --silent
fi

pids=()
cleanup() { echo; echo "Stopping…"; for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

node server/server.mjs & pids+=($!)
npm --prefix web run dev --silent & pids+=($!)

for _ in $(seq 1 60); do
  curl -sf http://localhost:4000/api/health >/dev/null 2>&1 && curl -sf http://localhost:5173 >/dev/null 2>&1 && break
  sleep 1
done

cat <<BANNER

  ✅ Clause — contract review demo is running

     Intake form (what a colleague submitting a contract sees):
        http://localhost:5173/

     Legal dashboard (what the legal team sees):
        http://localhost:5173/legal          password: ${LEGAL_PASSWORD:-demo}

     Six sample contracts are loaded, each with a completed review.
     Reload the demo data any time with:  ./run.sh --reseed

     Press Ctrl-C to stop.

BANNER

wait
