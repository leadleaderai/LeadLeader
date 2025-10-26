const express = require('express');
const { summarize } = require('../utils/metrics');

const router = express.Router();

// Human-friendly system page
router.get(['/system', '/system-health'], (req, res) => {
  let data;
  try {
    data = summarize();
  } catch (e) {
    data = { ok: false, error: e.message, totals: {}, latency: {} };
  }

  // Disable layout and set safe locals
  res.locals.layout = false;
  res.locals.title = 'System';
  res.locals.system = data || { ok: true, totals: {}, latency: {} };
  res.render('system_simple');
});

// Tiny JSON ping to validate latency in real time (used by the system page)
router.get('/system/ping', async (req, res) => {
  const t0 = process.hrtime.bigint();
  // trivial async to get a non-zero latency
  await new Promise(r => setTimeout(r, 5));
  const t1 = process.hrtime.bigint();
  const latencyMs = Number(t1 - t0) / 1e6;
  res.json({ ok: true, latencyMs: Math.round(latencyMs) });
});

module.exports = router;
