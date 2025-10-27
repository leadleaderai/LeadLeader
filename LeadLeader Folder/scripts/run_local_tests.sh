#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
PORT="${TEST_PORT:-${PORT:-3456}}"
export TEST_PORT="$PORT"
export PORT="$PORT"
export NODE_ENV=development

echo "== Starting server on :$PORT =="
node src/server.js > /tmp/ll_server.log 2>&1 & echo $! > /tmp/ll_pid
sleep 5

# Wait for server to be fully ready
for i in {1..20}; do
  if curl -s http://127.0.0.1:$PORT/_health > /dev/null 2>&1; then
    echo "Server is healthy"
    break
  fi
  sleep 0.5
done

echo "== Running smoke_test.js =="
node smoke_test.js

echo "== Running ux_improvements_smoke.js =="
node ux_improvements_smoke.js

echo "== Stopping server =="
kill "$(cat /tmp/ll_pid)" 2>/dev/null || true
rm -f /tmp/ll_pid

echo "All tests passed."
