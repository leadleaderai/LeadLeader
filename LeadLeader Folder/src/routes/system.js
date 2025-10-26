const express = require('express');
const os = require('os');
const router = express.Router();

function safeNum(n) { try { return Number.isFinite(n) ? n : 0; } catch { return 0; } }

router.get('/system', (req, res) => {
  // Disable express-ejs-layouts for this render only
  res.locals.layout = false;

  const mem = process.memoryUsage();
  const load = os.loadavg();
  const pkg = (() => { try { return require('../../package.json'); } catch { return {}; } })();

  const model = {
    title: 'System Health',
    nowIso: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpus: os.cpus()?.length || 1,
    rssMB: Math.round(safeNum(mem.rss) / 1024 / 1024),
    heapUsedMB: Math.round(safeNum(mem.heapUsed) / 1024 / 1024),
    heapTotalMB: Math.round(safeNum(mem.heapTotal) / 1024 / 1024),
    load1: safeNum(load[0]).toFixed(2),
    load5: safeNum(load[1]).toFixed(2),
    load15: safeNum(load[2]).toFixed(2),
    // Features
    enableTranscribe: String(process.env.ENABLE_TRANSCRIBE || 'false') === 'true',
    enablePolly: String(process.env.ENABLE_POLLY || 'false') === 'true',
    enableTextChat: String(process.env.ENABLE_TEXT_CHAT || 'false') === 'true',
    enableSystemDash: String(process.env.ENABLE_SYSTEM_DASHBOARD || 'true') === 'true',
    signupEnabled: String(process.env.SIGNUP_ENABLED || 'true') === 'true',
    requireHCaptcha: String(process.env.REQUIRE_HCAPTCHA_SIGNUP || 'false') === 'true',
    // Build
    nodeEnv: process.env.NODE_ENV || 'development',
    appVersion: pkg.version || null,
    region: process.env.FLY_REGION || process.env.AWS_REGION || null,
    baseUrl: process.env.PUBLIC_BASE_URL || null
  };

  // render a standalone template that does NOT expect layout variables
  res.render('system_simple', model);
});

// Simple JSON ping to test end-to-end latency
router.get('/system/ping', async (req, res) => {
  const t0 = process.hrtime.bigint();
  const payload = { ok: true, ts: Date.now() };
  const t1 = process.hrtime.bigint();
  payload.serverOverheadMs = Number(t1 - t0) / 1e6;
  res.json(payload);
});

module.exports = router;
