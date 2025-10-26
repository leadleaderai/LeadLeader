# LeadLeader – Environment Variables

This document lists environment variables used by LeadLeader and how to configure secrets for production deployments (Fly.io example).

IMPORTANT: Never commit a real `.env` file or service-account JSON to source control. Use your platform's secrets system.

## Core env variables (required/recommended)

- PORT — port the Express server listens on (default `3000`). Optional in many PaaS (provided by platform).
- NODE_ENV — `production` or `development`.
- CRON_SECRET — secret key to secure `/cron/daily` endpoints (required for cron job calls).
- OWNER_TIMEZONE — IANA timezone for tenant/date calculations (default `America/Los_Angeles`).

## Twilio
- TWILIO_ACCOUNT_SID — Twilio account SID (optional, required for outbound actions).
- TWILIO_AUTH_TOKEN — Twilio auth token.
- TWILIO_PHONE_NUMBER — Twilio phone number used for caller ID.

## Google Sheets / STT
- GOOGLE_SERVICE_ACCOUNT_JSON — Full service-account JSON string (or set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY instead).
- SHEETS_SPREADSHEET_ID — ID of the Google Sheets spreadsheet used by the app.

## SendGrid
- SENDGRID_API_KEY — API key for SendGrid to send email summaries.
- SENDGRID_FROM_EMAIL — Verified from address used in emails.

## Deployment: Fly.io example

Set secrets with `fly secrets set`. Example:

```bash
fly secrets set \
  CRON_SECRET="yourcronsecret" \
  SENDGRID_API_KEY="SG_xxx" \
  GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account", ... }' \
  SHEETS_SPREADSHEET_ID="your-spreadsheet-id"
```

Notes:
- For `GOOGLE_SERVICE_ACCOUNT_JSON` you can either paste the raw JSON (single-line string) or set `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` separately. If you paste the raw JSON, ensure proper escaping in your shell.

## Quick test (local)

1. Copy `.env.example` -> `.env` and fill the required keys (do not commit `.env`).
2. Install and start:

```bash
npm install
npm start
```

3. Health check:

```bash
curl http://localhost:3000/_health
```

Expected JSON includes: `{ ok: true, uptime: <seconds>, env: { node_env, features: { ai, transcribe } } }`.

4. Twilio webhook test: POST `/voice` will return TwiML when invoked by Twilio. For local testing use `ngrok` or your platform.

## Never commit
- `.env`, `.env.*`, `*.pem`, `credentials*.json`, and other private keys. Use platform secrets.
