const express = require('express');
const router = express.Router();

// Very defensive: all locals have defaults so EJS never 500s
router.get('/try', (req, res) => {
  res.locals.layout = false;
  res.locals.title = 'Try LeadLeader';
  res.locals.features = {
    chat: process.env.ENABLE_TEXT_CHAT === 'true',
    voice: true, // keep the existing recorder demo link visible
  };
  res.render('try_simple');
});

module.exports = router;
