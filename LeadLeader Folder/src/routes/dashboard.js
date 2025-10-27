// ═══════════════════════════════════════════════════════════
// ROUTE: /dashboard.js - User activity feed (NOW roadmap)
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { listEventsByUser } = require('../utils/store/eventsStore');
const { getPlan } = require('../utils/usersStore');
const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(302).redirect('/auth/login');

// Get today's quota usage for a user
async function getQuotaUsage(userId, plan) {
  try {
    const fs = require('fs').promises;
    const quotasPath = '/workspaces/LeadLeader/LeadLeader Folder/data/quotas.json';
    const content = await fs.readFile(quotasPath, 'utf8');
    const data = JSON.parse(content);
    
    const today = new Date().toISOString().split('T')[0];
    const userQuotas = data.quotas?.[userId] || {};
    const dailyKey = `contact_daily_${today}`;
    const used = userQuotas[dailyKey] || 0;
    
    const limits = { free: 6, pro: 50, biz: 500 };
    const limit = limits[plan] || limits.free;
    
    return { used, limit, remaining: Math.max(0, limit - used) };
  } catch (err) {
    return { used: 0, limit: 6, remaining: 6 };
  }
}

// ───────────────────────────────────────────────
// ROUTE: /dashboard - Display last 50 events for user
// SOURCE: eventsStore.js (NOW roadmap: In-App Results Feed)
// ───────────────────────────────────────────────
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const username = req.session.user.username;
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const requestedLimit = parseInt(req.query.limit) || 50;
    const limit = [10, 50, 100].includes(requestedLimit) ? requestedLimit : 50;
    
    const events = await listEventsByUser(userId, { limit, offset });
    const nextOffset = events.length === limit ? offset + limit : null;
    
    // Get user's plan and quota usage
    const plan = await getPlan(username) || 'free';
    const quotaUsage = await getQuotaUsage(userId, plan);
    
    res.render('dashboard', {
      title: 'Dashboard',
      events,
      nextOffset,
      limit,
      plan,
      quotaUsage
    });
  } catch (err) {
    console.error('[dashboard] Error:', err);
    res.status(500).send('Failed to load dashboard');
  }
});

module.exports = router;
