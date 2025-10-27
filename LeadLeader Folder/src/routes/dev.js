// ═══════════════════════════════════════════════════════════
// ROUTE: /dev.js - Development seed endpoints (NOW roadmap)
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { appendEvent } = require('../utils/store/eventsStore');
const { sendMessage } = require('../utils/store/messagesStore');
const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(302).redirect('/auth/login');

// Only enable in development
const isDev = process.env.NODE_ENV !== 'production';

// ───────────────────────────────────────────────
// ROUTE: POST /dev/seed/event - Seed test event
// ───────────────────────────────────────────────
router.post('/dev/seed/event', requireAuth, async (req, res) => {
  if (!isDev) return res.status(404).json({ ok: false, error: 'not_found' });
  
  try {
    const userId = req.session.user.id;
    const { type, payload } = req.body;
    
    const event = await appendEvent({
      userId,
      type: type || 'test_event',
      payload: payload || { message: 'Test event from seed endpoint' },
      createdAt: new Date().toISOString()
    });
    
    res.json({ ok: true, event });
  } catch (err) {
    console.error('[dev/seed/event]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ───────────────────────────────────────────────
// ROUTE: POST /dev/seed/dm - Seed test DM from owner
// ───────────────────────────────────────────────
router.post('/dev/seed/dm', requireAuth, async (req, res) => {
  if (!isDev) return res.status(404).json({ ok: false, error: 'not_found' });
  
  try {
    const userId = req.session.user.id;
    const { body } = req.body;
    
    const message = await sendMessage({
      fromUserId: null, // Owner
      toUserId: userId,
      body: body || 'Test DM from owner (seed endpoint)',
      createdAt: new Date().toISOString()
    });
    
    res.json({ ok: true, message });
  } catch (err) {
    console.error('[dev/seed/dm]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
