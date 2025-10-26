#!/bin/bash
set -euo pipefail

APP="leadleader-ty-demo"
REGION="iad"

echo "========================================="
echo "LeadLeader Deployment Script"
echo "========================================="

echo ""
echo "Step 1: Check for existing volume..."
if ! flyctl volumes list -a "$APP" 2>/dev/null | grep -q "data"; then
  echo "Creating volume 'data' in region $REGION..."
  flyctl volumes create data --region "$REGION" --size 1 -a "$APP" -y
else
  echo "Volume 'data' already exists"
fi

echo ""
echo "Step 2: Ensure app is scaled to 1 machine (required for volume)..."
flyctl scale count 1 -a "$APP" -y || true

echo ""
echo "Step 3: Deploying application..."
flyctl deploy --remote-only --strategy immediate -a "$APP"

echo ""
echo "Step 4: Waiting for deployment to settle..."
sleep 8

echo ""
echo "Step 5: Verifying endpoints..."
echo "========================================="
for endpoint in / /_health /auth/login /auth/signup /contact /system /try /dashboard /owner/users; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://${APP}.fly.dev${endpoint}")
  status="✅"
  if [ "$endpoint" = "/dashboard" ] || [ "$endpoint" = "/owner/users" ]; then
    # These should redirect (302) when not authenticated
    [ "$code" = "302" ] && status="✅" || status="❌"
  else
    [ "$code" = "200" ] && status="✅" || status="❌"
  fi
  echo "$status https://${APP}.fly.dev${endpoint} -> ${code}"
done

echo ""
echo "Step 6: Checking system dashboard..."
echo "========================================="
curl -s "https://${APP}.fly.dev/system" | head -30

echo ""
echo "Step 7: Checking users store logs..."
echo "========================================="
flyctl logs -a "$APP" --json | jq -r 'select(.message | contains("users_")) | .message' | tail -5 || echo "No user store logs found yet"

echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
echo ""
echo "Live URLs:"
echo "  Home: https://${APP}.fly.dev/"
echo "  Login: https://${APP}.fly.dev/auth/login"
echo "  Signup: https://${APP}.fly.dev/auth/signup"
echo "  System: https://${APP}.fly.dev/system"
echo "  Try Hub: https://${APP}.fly.dev/try"
echo ""
echo "Owner Login:"
echo "  Username: \$OWNER_USERNAME (Fly secret)"
echo "  Password: \$OWNER_PASSWORD (Fly secret)"
echo "  Panel: https://${APP}.fly.dev/owner/users"
echo ""
echo "Volume:"
echo "  Name: data"
echo "  Path: /app/data"
echo "  Users file: /app/data/users.json"
echo ""
