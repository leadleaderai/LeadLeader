# LeadLeader — Voice Receptionist (MVP)

Quick start

1. Copy `.env.example` -> `.env` and fill secrets (do NOT commit `.env`).
2. Install and prepare:

```bash
cd "/workspaces/LeadLeader/LeadLeader Folder"
npm install
npm run prepare
```

3. Start locally and test health:

```bash
npm start &
sleep 5
curl -s http://localhost:8080/_health
```

Environment variables
- See `.env.example`. Use Fly secrets for deployment (never commit `.env`).

Deploy to Fly (example)

```bash
# create app (interactive)
flyctl launch --no-deploy
# set secrets (example)
flyctl secrets set \
  SHEETS_SPREADSHEET_ID=<REDACTED> \
  SENDGRID_API_KEY=<REDACTED> \
  SENDGRID_FROM=<REDACTED> \
  TWILIO_ACCOUNT_SID=<REDACTED> \
  TWILIO_AUTH_TOKEN=<REDACTED> \
  TWILIO_NUMBER=<REDACTED> \
  TENANT_ID=demo TENANT_TIMEZONE=America/Los_Angeles RECIPIENTS=you@example.com CRON_SECRET=<REDACTED>

flyctl deploy
```

Testing Twilio webhook (example)
- Point Twilio incoming voice webhook to `https://<your-app>.fly.dev/voice`

Notes
- Secrets must be rotated if accidentally exposed.
- The repo includes a Husky pre-commit hook to help prevent accidental commits of common secret patterns.
