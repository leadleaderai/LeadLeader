// ═══════════════════════════════════════════════════════════
// ROUTE: /userSettings.js - Inbox & notification preferences (NOW roadmap)
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { listMessagesFor, markRead, markAllRead } = require('../utils/store/messagesStore');
const { getPrefs, setPrefs } = require('../utils/store/prefsStore');
const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(302).redirect('/auth/login');

// ───────────────────────────────────────────────
// ROUTE: /inbox - Display DMs from owner
// ───────────────────────────────────────────────
router.get('/inbox', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit = 50;
    
    const messages = await listMessagesFor(userId, { limit, offset });
    const unreadCount = messages.filter(m => !m.read).length;
    const nextOffset = messages.length === limit ? offset + limit : null;
    
    res.render('inbox', {
      title: `Inbox${unreadCount > 0 ? ` (${unreadCount})` : ''}`,
      messages,
      nextOffset,
      unreadCount
    });
  } catch (err) {
    console.error('[inbox] Error:', err);
    res.status(500).send('Failed to load inbox');
  }
});

// ───────────────────────────────────────────────
// ROUTE: POST /inbox/read - Mark messages as read
// ───────────────────────────────────────────────
router.post('/inbox/read', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, error: 'No message IDs provided' });
    }
    
    await markRead({ userId, messageIds: ids });
    res.json({ ok: true });
  } catch (err) {
    console.error('[inbox/read] Error:', err);
    res.status(500).json({ ok: false, error: 'Failed to mark messages as read' });
  }
});

// ───────────────────────────────────────────────
// ROUTE: POST /inbox/mark-all-read - Mark all messages as read
// ───────────────────────────────────────────────
router.post('/inbox/mark-all-read', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const count = await markAllRead(userId);
    res.json({ ok: true, count });
  } catch (err) {
    console.error('[inbox/mark-all-read] Error:', err);
    res.status(500).json({ ok: false, error: 'Failed to mark all messages as read' });
  }
});

// ───────────────────────────────────────────────
// ROUTE: /settings/notifications - Notification preferences
// ───────────────────────────────────────────────
router.get('/settings/notifications', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const prefs = await getPrefs(userId);
    
    res.render('settings_notifications', {
      title: 'Notification Preferences',
      prefs,
      message: null
    });
  } catch (err) {
    console.error('[settings/notifications] Error:', err);
    res.status(500).send('Failed to load settings');
  }
});

// ───────────────────────────────────────────────
// ROUTE: POST /settings/notifications - Save preferences
// ───────────────────────────────────────────────
router.post('/settings/notifications', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { emailEnabled, inAppEnabled, digestCadence } = req.body;
    
    const partial = {
      emailEnabled: emailEnabled === 'true',
      inAppEnabled: inAppEnabled === 'true',
      digestCadence: digestCadence || 'none'
    };
    
    await setPrefs(userId, partial);
    const prefs = await getPrefs(userId);
    
    res.render('settings_notifications', {
      title: 'Notification Preferences',
      prefs,
      message: 'Preferences saved successfully!'
    });
  } catch (err) {
    console.error('[settings/notifications] Error:', err);
    res.status(500).send('Failed to save settings');
  }
});

module.exports = router;
