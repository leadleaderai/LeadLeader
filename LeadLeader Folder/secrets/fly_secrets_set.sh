#!/usr/bin/env bash
# ===========================================================================
# Fly.io Secrets Deployment Script
# ===========================================================================
# INSTRUCTIONS:
# 1. Fill in the values in the heredoc below
# 2. If GOOGLE_SERVICE_ACCOUNT_JSON is raw JSON, base64-encode it first:
#    base64 -w0 your-service-account.json > sa.b64
#    Then paste the contents into GOOGLE_SERVICE_ACCOUNT_JSON=
# 3. Run: bash secrets/fly_secrets_set.sh
# ===========================================================================

set -e

cat > /tmp/leadleader_secrets.env <<'ENV'
PORT=8080
PUBLIC_BASE_URL=https://<your-app>.fly.dev
TENANT_ID=demo
TENANT_TIMEZONE=America/Los_Angeles
RECIPIENTS=you@example.com
SHEETS_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=
SENDGRID_API_KEY=
SENDGRID_FROM=you@example.com
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_NUMBER=+1XXXXXXXXXX
CRON_SECRET=
ENABLE_AI_REDIRECT=false
ENABLE_TRANSCRIBE=false
VALIDATE_TWILIO_SIGNATURE=false
ENV

echo "📦 Setting Fly.io secrets..."
echo ""
echo "Preview of secrets being set:"
cat /tmp/leadleader_secrets.env
echo ""
echo "Press Enter to continue or Ctrl+C to cancel..."
read

# Set all secrets at once (more efficient than individual calls)
flyctl secrets set $(cat /tmp/leadleader_secrets.env | grep -v '^\s*#' | grep -v '^\s*$' | tr '\n' ' ')

echo ""
echo "✅ Secrets set successfully!"
echo "🚀 Deploy with: flyctl deploy"

# Clean up
rm -f /tmp/leadleader_secrets.env
