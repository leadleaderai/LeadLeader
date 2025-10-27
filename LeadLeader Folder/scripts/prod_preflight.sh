#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# PRODUCTION PREFLIGHT CHECKS
# Verifies Fly secrets, volume, and health before deploy
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
# Check critical secrets
# ───────────────────────────────────────────────
echo "🔐 Checking Critical Secrets..."

CRITICAL_SECRETS=(
  "OWNER_USERNAME"
  "OWNER_PASSWORD"
  "SESSION_SECRET"
  "PUBLIC_BASE_URL"
)

for secret in "${CRITICAL_SECRETS[@]}"; do
  if fly secrets list --app "$APP" 2>/dev/null | grep -q "^${secret}"; then
    echo "  ✅ ${secret}"
  else
    echo "  ❌ ${secret} - MISSING (CRITICAL)"
    CRITICAL_MISSING=$((CRITICAL_MISSING + 1))
  fi
done

# ───────────────────────────────────────────────
# Check email secrets (warn only)
# ───────────────────────────────────────────────
echo ""
echo "📧 Checking Email Secrets (optional)..."

EMAIL_SECRETS=(
  "SENDGRID_API_KEY"
  "SENDGRID_FROM"
  "RECIPIENTS"
)

for secret in "${EMAIL_SECRETS[@]}"; do
  if fly secrets list --app "$APP" 2>/dev/null | grep -q "^${secret}"; then
    echo "  ✅ ${secret}"
  else
    echo "  ⚠️  ${secret} - MISSING (email features disabled)"
    WARNINGS=$((WARNINGS + 1))
  fi
done

# ───────────────────────────────────────────────
# Check volume mount
# ───────────────────────────────────────────────
echo ""
echo "💾 Checking Volume Configuration..."

if [ -f "fly.toml" ]; then
  if grep -q "\[mounts\]" fly.toml && grep -q "destination.*=.*\"/data\"" fly.toml; then
    echo "  ✅ Volume mount configured in fly.toml"
  else
    echo "  ⚠️  Volume mount not found in fly.toml"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "  ⚠️  fly.toml not found"
  WARNINGS=$((WARNINGS + 1))
fi

# Check if volume exists
if fly volumes list --app "$APP" 2>/dev/null | grep -q "data"; then
  echo "  ✅ Volume 'data' exists"
else
  echo "  ⚠️  Volume 'data' not found"
  WARNINGS=$((WARNINGS + 1))
fi

# ───────────────────────────────────────────────
# Check health endpoint
# ───────────────────────────────────────────────
echo ""
echo "🏥 Checking Health Endpoint..."

if curl -sf "${HEALTH_URL}" -m 5 > /dev/null 2>&1; then
  HEALTH_DATA=$(curl -s "${HEALTH_URL}" -m 5)
  echo "  ✅ ${HEALTH_URL} - HEALTHY"
  echo "     ${HEALTH_DATA}" | head -c 100
  echo ""
else
  echo "  ⚠️  ${HEALTH_URL} - UNREACHABLE (app may not be deployed)"
  WARNINGS=$((WARNINGS + 1))
fi

# ───────────────────────────────────────────────
# Summary
# ───────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "PREFLIGHT SUMMARY"
echo "═══════════════════════════════════════════════════════════"

if [ $CRITICAL_MISSING -eq 0 ]; then
  echo "✅ All critical secrets present"
else
  echo "❌ ${CRITICAL_MISSING} critical secret(s) missing"
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
  echo "Set missing secrets with:"
  echo "  fly secrets set OWNER_USERNAME=<value> OWNER_PASSWORD=<value> --app ${APP}"
  echo "  fly secrets set SESSION_SECRET=\$(openssl rand -base64 32) --app ${APP}"
  echo "  fly secrets set PUBLIC_BASE_URL=https://${APP}.fly.dev --app ${APP}"
  exit 1
else
  echo "✅ PREFLIGHT PASSED - Ready to deploy"
  if [ $WARNINGS -gt 0 ]; then
    echo "   (${WARNINGS} optional features may be disabled)"
  fi
  exit 0
fi
