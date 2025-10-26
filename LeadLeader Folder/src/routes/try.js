const express = require('express');
const router = express.Router();

router.get('/try', (req, res) => {
  // Disable express-ejs-layouts for this render only
  res.locals.layout = false;

  // Keep it super simple; this page just links to the real demos
  res.render('try_simple', {
    title: 'Try LeadLeader',
    links: [
      { href: '/demo', label: 'Voice Demo (record & transcribe)' },
      { href: '/', label: 'Home' },
      { href: '/system', label: 'System Dashboard' },
    ],
  });
});

module.exports = router;
