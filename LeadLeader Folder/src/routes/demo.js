// ═══════════════════════════════════════════════════════════
// ROUTE: /demo.js - Voice recording demo interface
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { createPageData } = require('../utils/helpers');

// ───────────────────────────────────────────────
// ROUTE: /demo - Display voice recording interface
// FEATURES: Browser MediaRecorder API, upload to /upload
// ───────────────────────────────────────────────
router.get('/demo', (req, res) => {
  const pageData = createPageData({
    title: 'Voice Demo',
    description: 'Try AI-powered voice transcription and text-to-speech',
    path: '/demo'
  });
  
  res.render('demo', pageData);
});

// ───────────────────────────────────────────────
// ROUTE: /demo/chat - Text chat demo
// ───────────────────────────────────────────────
router.get('/demo/chat', (req, res) => {
  const config = require('../utils/config');
  
  if (!config.ENABLE_TEXT_CHAT) {
    return res.status(404).send('Chat demo not available');
  }
  
  const pageData = createPageData({
    title: 'Chat Demo',
    description: 'Try our text-based assistant',
    path: '/demo/chat'
  });
  
  res.render('demo_chat', pageData);
});

module.exports = router;
