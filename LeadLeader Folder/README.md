# LeadLeader — Voice Receptionist (MVP)

A Twilio-powered voice receptionist built with Node.js/Express that:
- Greets callers with consent notice
- Gathers intent (demo|subscribe|appointment)
- Collects: name, phone, preferred time, optional plan
- Triggers background pipeline: Google Sheets, SendGrid email, Google Calendar event
- Deployed on Fly.io

---

## 🚀 Local Run

### 1. Install dependencies

```bash
npm ci || npm install
```

### 2. Initialize Husky hooks

```bash
npm run prepare
```

### 3. Configure environment

Copy `.env.example` to `.env` and fill in required secrets:

**Required secrets** (names only — never commit values):
- `PORT` (default 8080)
- `PUBLIC_BASE_URL` (for audio file URLs)
- `TENANT_ID`, `TENANT_TIMEZONE`, `RECIPIENTS`
- `SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` (base64 or raw JSON)
- `SENDGRID_API_KEY`, `SENDGRID_FROM`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER`
- `CRON_SECRET`

### 4. Start server

```bash
npm start
```

Or use the automated bootstrap:

```bash
npm run bootstrap
```

This will install deps, prepare hooks, start the server, and poll `/_health`.

### 5. Smoke test

```bash
npm run smoke
```

---

## ☁️ Fly.io Deploy

### 1. Install flyctl and login

```bash
curl -L https://fly.io/install.sh | sh
flyctl auth login
```

### 2. Create app

```bash
flyctl apps create <your-app-name>
```

### 3. Set secrets

```bash
flyctl secrets set \
  PORT=8080 \
  PUBLIC_BASE_URL=https://<your-app>.fly.dev \
  TENANT_ID=demo \
  TENANT_TIMEZONE=America/Los_Angeles \
  RECIPIENTS=you@example.com \
  SHEETS_SPREADSHEET_ID=<REDACTED> \
  GOOGLE_SERVICE_ACCOUNT_JSON=<base64-encoded-json> \
  SENDGRID_API_KEY=<REDACTED> \
  SENDGRID_FROM=you@example.com \
  TWILIO_ACCOUNT_SID=<REDACTED> \
  TWILIO_AUTH_TOKEN=<REDACTED> \
  TWILIO_NUMBER=+1XXXXXXXXXX \
  CRON_SECRET=<random-string> \
  ENABLE_AI_REDIRECT=false \
  ENABLE_TRANSCRIBE=false \
  VALIDATE_TWILIO_SIGNATURE=false
```

### 4. Deploy

```bash
flyctl deploy
```

### 5. Verify health

```bash
curl -sSf https://<your-app>.fly.dev/_health
```

---

## 📞 Twilio Webhook Setup

In your Twilio console:
1. Go to Phone Numbers → Active Numbers → Select your number
2. Set **Voice & Fax** → **A Call Comes In** → **Webhook**:
   - **HTTP POST** to `https://<your-app>.fly.dev/voice`

---

## ✅ Test Checklist

After a test call:
1. **Google Sheets**: Check `Calls` tab for new row with call details
2. **Email**: Verify SendGrid sent summary email to `RECIPIENTS`
3. **Calendar**: Confirm Google Calendar event created with 30m duration

---

## 🔒 Security Notes

- Never commit `.env` — it's in `.gitignore`
- Rotate secrets if accidentally exposed
- Husky pre-commit hook scans for common secret patterns
- Health endpoint (`/_health`) exposes only redacted config via `config.safe()`

---

## 📝 TODO (Future Enhancements)

- TODO(sonnet): LLM fallback for unknown intents (OpenAI/Anthropic)
- TODO(sonnet): ElevenLabs voice cloning for branded audio
- TODO(sonnet): Multi-tenant DB (replace `tenants.json`)
- TODO(sonnet): Admin dashboard for call analytics

---

## 📄 License

ISC
