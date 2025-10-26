#!/bin/bash
set -euo pipefail

ROOT="/workspaces/LeadLeader/LeadLeader Folder"
APP="leadleader-ty-demo"
cd "$ROOT"

echo "═══════════════════════════════════════════"
echo "LeadLeader Full Deployment Script"
echo "═══════════════════════════════════════════"

echo ""
echo "== 1) Local Smoke Tests =="
echo "Starting server in background..."
PORT=8080 NODE_ENV=development OWNER_USERNAME=TestOwner OWNER_PASSWORD=testpass123 node src/server.js > /tmp/ll_server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 3

echo "Testing endpoints..."
endpoints=(
  "/"
  "/_health"
  "/auth/login"
  "/auth/signup"
  "/contact"
  "/system"
  "/try"
  "/privacy"
  "/terms"
  "/robots.txt"
  "/sitemap.txt"
)

for endpoint in "${endpoints[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080${endpoint}" || echo "FAIL")
  echo "  ${endpoint} -> ${code}"
done

echo ""
echo "Testing owner login..."
login_response=$(curl -s -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=TestOwner&password=testpass123")
echo "  Login response: ${login_response}"

echo ""
echo "Stopping local server..."
kill $SERVER_PID || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "== 2) Check Fly Volume =="
if flyctl volumes list -a "$APP" 2>/dev/null | grep -q "data"; then
  echo "✓ Volume 'data' exists"
else
  echo "Creating volume 'data' in iad..."
  flyctl volumes create data --size 1 -a "$APP" -r iad || true
fi

echo ""
echo "== 3) Scale to 1 (volume constraint) =="
flyctl scale count 1 -a "$APP" || true

echo ""
echo "== 4) Deploy to Fly =="
flyctl deploy --remote-only --strategy immediate -a "$APP"

echo ""
echo "== 5) Wait for deployment =="
sleep 8

echo ""
echo "== 6) Verify Live Endpoints =="
live_endpoints=(
  "/"
  "/_health"
  "/auth/login"
  "/auth/signup"
  "/contact"
  "/system"
  "/try"
  "/dashboard"
  "/owner/users"
  "/privacy"
  "/terms"
  "/robots.txt"
)

echo "Endpoint Status Matrix:"
for endpoint in "${live_endpoints[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://${APP}.fly.dev${endpoint}" || echo "FAIL")
  echo "  https://${APP}.fly.dev${endpoint} -> ${code}"
done

echo ""
echo "== 7) Check System Dashboard Content =="
echo "First 50 lines of /system:"
curl -s "https://${APP}.fly.dev/system" | head -50

echo ""
echo "═══════════════════════════════════════════"
echo "Deployment Complete!"
echo "═══════════════════════════════════════════"
echo "Live URL: https://${APP}.fly.dev"
echo "Users store: /app/data/users.json (on volume)"
echo "Logs: /app/data/logs/app.ndjson"
echo "Owner panel: https://${APP}.fly.dev/owner/users"
echo "System dashboard: https://${APP}.fly.dev/system"
