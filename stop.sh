#!/usr/bin/env bash
# Stop the demo: whatever is listening on the backend (4000) and frontend (5173) ports.
# Use it if Ctrl-C didn't stop ./run.sh, or the demo is running in another window.
PORTS="4000 5173"

listeners() { lsof -ti:"$1" -sTCP:LISTEN 2>/dev/null || true; }

found=""
for port in $PORTS; do
  p=$(listeners "$port")
  if [ -n "$p" ]; then found=1; kill $p 2>/dev/null || true; fi
done
[ -n "$found" ] || { echo "The demo isn't running."; exit 0; }

# Give them a moment to exit cleanly, then force anything that's left.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  left=""; for port in $PORTS; do [ -n "$(listeners "$port")" ] && left=1; done
  [ -z "$left" ] && { echo "Demo stopped."; exit 0; }
  sleep 0.3
done
for port in $PORTS; do p=$(listeners "$port"); [ -n "$p" ] && kill -9 $p 2>/dev/null; done
echo "Demo stopped (forced)."
