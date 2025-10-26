const express = require('express');
const os = require('os');
const { summarize } = require('../utils/metrics');
const config = require('../utils/config');

const router = express.Router();

// Human-friendly system page
router.get(['/system', '/system-health'], (req, res) => {
  let data;
  try {
    data = summarize();
  } catch (e) {
    data = { ok: false, error: e.message, totals: {}, latency: {} };
  }

  // Gather system info
  const uptimeSec = Math.floor(process.uptime());
  const mem = process.memoryUsage();
  const loadAvg = os.loadavg();

  // Disable layout and set safe locals
  res.locals.layout = false;
  res.locals.title = 'System';
  res.locals.system = data || { ok: true, totals: {}, latency: {} };
  res.locals.nowIso = new Date().toISOString();
  res.locals.uptimeSec = uptimeSec;
  res.locals.node = process.version;
  res.locals.platform = `${os.platform()} ${os.release()}`;
  res.locals.cpus = os.cpus().length;
  res.locals.rssMB = (mem.rss / 1024 / 1024).toFixed(1);
  res.locals.heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
  res.locals.heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
  res.locals.load1 = loadAvg[0].toFixed(2);
  res.locals.load5 = loadAvg[1].toFixed(2);
  res.locals.load15 = loadAvg[2].toFixed(2);
  
  // Feature flags
  res.locals.enableTranscribe = config.ENABLE_TRANSCRIBE;
  res.locals.enablePolly = config.ENABLE_POLLY;
  res.locals.enableTextChat = config.ENABLE_TEXT_CHAT;
  res.locals.enableSystemDash = config.ENABLE_SYSTEM_DASHBOARD;
  res.locals.signupEnabled = config.SIGNUP_ENABLED;
  res.locals.requireHCaptcha = config.REQUIRE_HCAPTCHA_SIGNUP;
  
  // Build info
  res.locals.nodeEnv = config.NODE_ENV;
  res.locals.appVersion = res.locals.version || 'v0.1';
  res.locals.region = process.env.FLY_REGION || null;
  res.locals.baseUrl = config.PUBLIC_BASE_URL || null;
  
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
