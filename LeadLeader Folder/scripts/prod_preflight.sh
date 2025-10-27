#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# PRODUCTION PREFLIGHT CHECKS
# Comprehensive checks before deployment
# ═══════════════════════════════════════════════════════════

set -euo pipefail

APP="${FLY_APP_NAME:-leadleader}"
HEALTH_URL="https://${APP}.fly.dev/_health"

echo "═══════════════════════════════════════════════════════════"
echo "Production Preflight Checks - ${APP}"
echo "═══════════════════════════════════════════════════════════"
echo ""

CRITICAL_MISSING=0
WARNINGS=0

# ───────────────────────────────────────────────
# Check 1: Node.js version >= 20
# ───────────────────────────────────────────────
echo "� Checking Node.js version..."

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "  ❌ Node.js version is $NODE_VERSION, but >= 20 is required (CRITICAL)"
  CRITICAL_MISSING=$((CRITICAL_MISSING + 1))
else
  echo "  ✅ Node.js version $NODE_VERSION OK"
fi

# ───────────────────────────────────────────────
# Check 2: Parse fly.toml for volume mounts
# ───────────────────────────────────────────────
echo ""
echo "📋 Checking fly.toml configuration..."

if [ ! -f "fly.toml" ]; then
  echo "  ❌ fly.toml not found (CRITICAL)"
  CRITICAL_MISSING=$((CRITICAL_MISSING + 1))
else
  # Check for [mounts] or [[mounts]] section with destination="/app/data"
  if (grep -A2 '^\[mounts\]' fly.toml | grep -q 'destination.*=.*"/app/data"') || \
     (grep -A2 '^\[\[mounts\]\]' fly.toml | grep -q 'destination.*=.*"/app/data"'); then
    echo "  ✅ fly.toml has volume mount to /app/data"
  else
    echo "  ❌ fly.toml missing [mounts] or [[mounts]] with destination=\"/app/data\" (CRITICAL)"
    CRITICAL_MISSING=$((CRITICAL_MISSING + 1))
  fi
fi

# ───────────────────────────────────────────────
# Check 3: Verify volume exists on Fly
# ───────────────────────────────────────────────
echo ""
echo "💾 Checking Fly.io volumes..."

if ! command -v flyctl &> /dev/null && ! command -v fly &> /dev/null; then
  echo "  ⚠️  flyctl not installed, skipping volume check"
  WARNINGS=$((WARNINGS + 1))
else
  FLY_CMD="fly"
  command -v flyctl &> /dev/null && FLY_CMD="flyctl"
  
  if ! $FLY_CMD volumes list --app "$APP" 2>/dev/null | grep -q "data"; then
    echo "  ❌ No volume named 'data' found in Fly.io (CRITICAL)"
    CRITICAL_MISSING=$((CRITICAL_MISSING + 1))
  else
    echo "  ✅ Volume 'data' exists on Fly.io"
  fi
fi

# ───────────────────────────────────────────────
# Check 4: Local write test to ./data
# ───────────────────────────────────────────────
echo ""
echo "✍️  Testing local write to ./data directory..."

if [ ! -d "./data" ]; then
  echo "  ⚠️  ./data directory does not exist (will be created on first run)"
  WARNINGS=$((WARNINGS + 1))
else
  if ! touch ./data/.preflight_test 2>/dev/null; then
    echo "  ❌ Cannot write to ./data directory (CRITICAL)"
    CRITICAL_MISSING=$((CRITICAL_MISSING + 1))
  else
    rm -f ./data/.preflight_test
    echo "  ✅ Local ./data write test passed"
  fi
fi

# ───────────────────────────────────────────────
# Check 5: Critical Fly secrets
# ───────────────────────────────────────────────
echo ""
echo "� Checking Critical Secrets..."

CRITICAL_SECRETS=(
  "OWNER_USERNAME"
  "OWNER_PASSWORD"
  "SESSION_SECRET"
)

if ! command -v flyctl &> /dev/null && ! command -v fly &> /dev/null; then
  echo "  ⚠️  flyctl not installed, skipping secrets check"
  WARNINGS=$((WARNINGS + 1))
else
  FLY_CMD="fly"
  command -v flyctl &> /dev/null && FLY_CMD="flyctl"
  
  for secret in "${CRITICAL_SECRETS[@]}"; do
    if $FLY_CMD secrets list --app "$APP" 2>/dev/null | grep -q "^${secret}"; then
      echo "  ✅ ${secret}"
    else
      echo "  ❌ ${secret} - MISSING (CRITICAL)"
      CRITICAL_MISSING=$((CRITICAL_MISSING + 1))
    fi
  done
fi

# ───────────────────────────────────────────────
# Check 6: Optional secrets
# ───────────────────────────────────────────────
echo ""
echo "� Checking Optional Secrets..."

OPTIONAL_SECRETS=(
  "SENDGRID_API_KEY"
  "SENDGRID_FROM"
  "RECIPIENTS"
  "CRON_SECRET"
)

if ! command -v flyctl &> /dev/null && ! command -v fly &> /dev/null; then
  echo "  ⚠️  flyctl not installed, skipping optional secrets check"
else
  FLY_CMD="fly"
  command -v flyctl &> /dev/null && FLY_CMD="flyctl"
  
  for secret in "${OPTIONAL_SECRETS[@]}"; do
    if $FLY_CMD secrets list --app "$APP" 2>/dev/null | grep -q "^${secret}"; then
      echo "  ✅ ${secret}"
    else
      echo "  ⚠️  ${secret} - MISSING (optional features may be disabled)"
      WARNINGS=$((WARNINGS + 1))
    fi
  done
fi

# ───────────────────────────────────────────────
# Check 7: Health endpoint
# ───────────────────────────────────────────────
echo ""
echo "🏥 Checking Health Endpoint..."

if curl -sf "${HEALTH_URL}" -m 5 > /dev/null 2>&1; then
  HEALTH_DATA=$(curl -s "${HEALTH_URL}" -m 5)
  echo "  ✅ ${HEALTH_URL} - HEALTHY"
  echo "     ${HEALTH_DATA}" | head -c 100
  echo ""
else
  echo "  ⚠️  ${HEALTH_URL} - UNREACHABLE (app may not be deployed yet)"
  WARNINGS=$((WARNINGS + 1))
fi

# ───────────────────────────────────────────────
# Check 8: Run local smoke tests
# ───────────────────────────────────────────────
echo ""
echo "🧪 Running local smoke tests..."

if [ ! -f "./scripts/run_local_tests.sh" ]; then
  echo "  ⚠️  run_local_tests.sh not found, skipping"
  WARNINGS=$((WARNINGS + 1))
else
  if bash ./scripts/run_local_tests.sh; then
    echo "  ✅ Local smoke tests passed"
  else
    echo "  ❌ Local smoke tests failed (CRITICAL)"
    CRITICAL_MISSING=$((CRITICAL_MISSING + 1))
  fi
fi

# ───────────────────────────────────────────────
# Check 9: Run E2E tests
# ───────────────────────────────────────────────
echo ""
echo "🔬 Running E2E tests..."

if [ ! -f "./test/e2e_now_roadmap.mjs" ]; then
  echo "  ⚠️  e2e_now_roadmap.mjs not found, skipping"
  WARNINGS=$((WARNINGS + 1))
else
  if node test/e2e_now_roadmap.mjs; then
    echo "  ✅ E2E tests passed"
  else
    echo "  ❌ E2E tests failed (CRITICAL)"
    CRITICAL_MISSING=$((CRITICAL_MISSING + 1))
  fi
fi

# ───────────────────────────────────────────────
# Summary
# ───────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "PREFLIGHT SUMMARY"
echo "═══════════════════════════════════════════════════════════"

if [ $CRITICAL_MISSING -eq 0 ]; then
  echo "✅ All critical checks passed"
else
  echo "❌ ${CRITICAL_MISSING} critical issue(s) detected"
fi

if [ $WARNINGS -eq 0 ]; then
  echo "✅ No warnings"
else
  echo "⚠️  ${WARNINGS} warning(s) - non-critical issues detected"
fi

echo ""

if [ $CRITICAL_MISSING -gt 0 ]; then
  echo "❌ PREFLIGHT FAILED - Fix critical issues before deploying"
  echo ""
  echo "Common fixes:"
  echo "  • Upgrade Node.js: nvm install 20 && nvm use 20"
  echo "  • Set missing secrets: fly secrets set KEY=value --app ${APP}"
  echo "  • Create volume: fly volumes create data --size 1 --app ${APP}"
  exit 1
else
  echo "✅ PREFLIGHT PASSED - Ready to deploy"
  if [ $WARNINGS -gt 0 ]; then
    echo "   (${WARNINGS} optional features may be disabled)"
  fi
  exit 0
fi
