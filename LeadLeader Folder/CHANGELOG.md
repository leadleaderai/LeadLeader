# CHANGELOG — Sonnet Sweep (October 2025)

## Summary

Comprehensive code quality and security sweep for LeadLeader voice receptionist. All changes made on branch `chore/sonnet-sweep-LL` with 8 atomic commits.

---

## What Changed

### Phase 0: Safety & Branch
- **Deleted `.env`** (contained secrets)
- Verified `.gitignore` completeness
- Created sweep branch `chore/sonnet-sweep-LL`

### Phase 1: Config Consolidation
- Enhanced `config/config.js` to export `safe()` with `recipients_count` instead of raw emails
- Replaced `process.env.PORT` with `config.PORT` in `index.js`
- All application code now uses centralized config (only `config/config.js` reads `process.env`)

### Phase 2: Server Hardening
- Added comprehensive docstring to `index.js` explaining purpose and routes
- Implemented structured JSON logging with `log(level, route, data)`
- Added Twilio signature validation toggle (respects `VALIDATE_TWILIO_SIGNATURE` flag)
- Added **consent notice** in `/voice` greeting: "This call may be recorded. We only store transcripts, not raw audio. Continuing means you agree."
- Enhanced error handling: all aftercall failures log with `callSid` for traceability
- Changed `GET /` response from emoji text to simple "LeadLeader OK"
- Set `app.set('trust proxy', 1)` for X-Forwarded headers (Fly.io)
- Upgraded body parsers: `express.json({limit:'1mb'})` and `express.urlencoded({extended:true, limit:'1mb'})`

### Phase 3: Intents & Voice
- Enhanced `router.js` with docstring and added utility functions:
  - `extractPhoneDigits(text)` — strips non-digits
  - `isLikelyTimePhrase(text)` — cheap heuristic for time expressions
- Updated `dialogue/text.json` to include all required keys: `greeting`, `consent_short`, `ask_intent`, `ask_name`, `ask_phone`, `ask_time`, `ask_plan`, `thanks`
- Updated `dialogue/voice_map.json` to match text keys
- Enhanced `utils/voice.js` docstring: clarified `playVoiceTwiml` skips Play if `PUBLIC_BASE_URL` missing (falls back to Say only)

### Phase 4: Aftercall Pipeline
- Added comprehensive docstring to `aftercall.js` explaining Promise.allSettled pattern and guarded integrations
- Already compliant with PHASE 4 requirements (no code changes needed)

### Phase 5: Tenants & Demo Data
- `tenants.json` already contained `_comment: "Demo data only — replace with tenant store in production"` (no changes needed)

### Phase 6: Tooling & Scripts
- Pinned `@sendgrid/mail` to stable `^7.7.0` (was wildcard `*`)
- Fixed `package.json` prepare script: `"prepare": "husky install || true"` (was temporarily no-op)
- Bootstrap and smoke scripts already present and correct

### Phase 7: Husky Secret Scan
- Enhanced `.husky/pre-commit` to print line numbers from diff when secrets detected
- Added file name output when blocking `.env` or credentials files
- Improved user feedback with ✅ emoji on success

### Phase 8: Deployment Artifacts
- `Dockerfile` already optimal (Node 20 alpine, non-root user, production-only deps)
- `fly.toml` already configured with `/_health` check
- **Rewrote `README.md`** with comprehensive sections:
  - Local run (bootstrap, smoke test)
  - Fly.io deploy (secrets, deploy, verify)
  - Twilio webhook setup
  - Test checklist (Sheets/Email/Calendar)
  - Security notes
  - TODO annotations for future enhancements

### Phase 9: Final Consistency
- Verified zero `process.env` references in application code (only `config/config.js` and test scripts use it)
- Added TODO(sonnet) annotations in README for future enhancements:
  - LLM fallback for unknown intents
  - ElevenLabs voice cloning
  - Multi-tenant DB
  - Admin dashboard
- Created this CHANGELOG

---

## Why These Changes

1. **Security**: Deleted `.env`, strengthened pre-commit hooks, centralized config with `safe()` redaction
2. **Readability**: Added docstrings, structured logging, comprehensive README
3. **Stability**: Non-blocking aftercall, guarded integrations, Promise.allSettled
4. **Scalability**: Centralized config ready for multi-tenant DB, voice map for branded audio
5. **Deployability**: Fly.io artifacts complete, bootstrap/smoke scripts tested

---

## How to Revert

If needed, revert the entire sweep:

```bash
git checkout main
git branch -D chore/sonnet-sweep-LL
```

Or cherry-pick specific commits:

```bash
git log chore/sonnet-sweep-LL --oneline
git cherry-pick <commit-hash>
```

---

## Test Status

- ✅ All routes unchanged (names/HTTP verbs intact)
- ✅ `/_health` endpoint returns redacted config
- ✅ Husky pre-commit hook blocks secrets
- ✅ Bootstrap script (`npm run bootstrap`) installs, starts, polls health
- ✅ Smoke test (`npm run smoke`) verifies `/_health` responds 200

---

## Next Steps (Post-Merge)

1. Merge `chore/sonnet-sweep-LL` → `main`
2. Run `npm ci && npm run prepare` locally
3. Verify `npm run smoke` passes
4. Deploy to Fly.io: `flyctl deploy`
5. Test live Twilio call → verify Sheets/Email/Calendar pipeline
6. Rotate any secrets that were accidentally exposed during development

---

**Sweep completed:** October 26, 2025  
**Branch:** `chore/sonnet-sweep-LL`  
**Commits:** 8 atomic commits  
**Status:** Ready for review & merge
