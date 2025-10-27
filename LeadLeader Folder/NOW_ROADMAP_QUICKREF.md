# NOW Roadmap - Quick Reference

## ✅ What Was Built

### 1. In-App Results Feed
- **Storage:** `src/utils/store/eventsStore.js`
- **Route:** GET `/dashboard` (requireAuth)
- **View:** `src/views/dashboard.ejs`
- **Integration:** Contact form appends events automatically

### 2. Notification Preferences
- **Storage:** `src/utils/store/prefsStore.js`
- **Routes:** GET/POST `/settings/notifications` (requireAuth)
- **View:** `src/views/settings_notifications.ejs`
- **Integration:** Contact form checks `emailEnabled` before sending

### 3. Owner DMs
- **Storage:** `src/utils/store/messagesStore.js`
- **Routes:** GET `/inbox`, POST `/inbox/read` (requireAuth), POST `/owner/dm` (requireOwner)
- **View:** `src/views/inbox.ejs`
- **UI:** Owner panel has "Send DM" button per user

### 4. Plans and Quotas
- **Storage:** `src/utils/store/quotasStore.js`, `usersStore.js` (extended)
- **Routes:** POST `/owner/users/plan` (requireOwner)
- **Limits:**
  - Free: 6 contacts/day, 20 chats/min
  - Pro: 50 contacts/day, 500 chats/min
  - Biz: 500 contacts/day, 5000 chats/min
- **Integration:** Contact form enforces quotas, returns 429 if exceeded

## 🧪 Testing

### Run Smoke Tests
```bash
cd "/workspaces/LeadLeader/LeadLeader Folder"
node smoke_test.js
```

### Dev Seed Endpoints (when logged in)
```bash
# Create test event
curl -X POST http://localhost:8080/dev/seed/event \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION" \
  -d '{"type":"test","payload":{"msg":"hello"}}'

# Create test DM
curl -X POST http://localhost:8080/dev/seed/dm \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION" \
  -d '{"body":"Test message from owner"}'
```

## 📁 Storage Files

All stored in `/app/data/`:
- `events.json` - User activity feed (max 50k events)
- `prefs.json` - Notification preferences per user
- `messages.json` - Owner DMs (max 10k messages)
- `quotas.json` - Rate limit tracking per user
- `users.json` - Extended with plan field

## 🔐 Default Settings

**New User:**
- Plan: `free`
- Email notifications: `false`
- In-app notifications: `true`
- Digest cadence: `none`

**Free Plan Limits:**
- 6 contact form submissions per day
- 20 chat messages per minute

## 🎯 Key Features

1. **Atomic Writes:** All stores use tmp+rename for data integrity
2. **Write Locks:** Promise-based locks prevent race conditions
3. **Auto-Cleanup:** Events/messages automatically trimmed at limits
4. **Quota Tracking:** Daily for contact, per-minute for chat
5. **Owner Tools:** Plan management + DM capability in `/owner/users`
6. **User Nav:** Dashboard, Inbox, Settings links appear when logged in

## 🚫 NOT Deployed

Per requirements, this is ready for local testing only. To deploy:
1. Ensure `/app/data` directory exists on production volume
2. Set `NODE_ENV=production` (dev endpoints will be disabled)
3. Deploy normally with `fly deploy`

## 📊 Status

- **Storage Layer:** ✅ Complete (4 stores + 1 extended)
- **Routes:** ✅ Complete (6 new routes)
- **Views:** ✅ Complete (3 new, 2 updated)
- **Integration:** ✅ Complete (contact form, owner panel, nav)
- **Tests:** ✅ Passing (14/14 endpoints)
- **Deployment:** ⏸️ Not performed (as requested)

See `NOW_ROADMAP_REPORT.md` for full details.
