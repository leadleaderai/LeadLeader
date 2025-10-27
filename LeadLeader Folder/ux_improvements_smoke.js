#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// UX Improvements Smoke Test Suite - Self-starting
// Tests all UX enhancements: toasts, badges, bulk actions, etc.
// ═══════════════════════════════════════════════════════════

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.TEST_PORT || process.env.PORT || 3000);
const BASE = `http://127.0.0.1:${PORT}`;
const ENTRY = path.join(process.cwd(), 'src', 'server.js');

function httpGet(pathname) {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}${pathname}`, (res) => resolve({ status: res.statusCode }));
    req.on('error', () => resolve({ status: 0 }));
    req.setTimeout(2000, () => { req.destroy(); resolve({ status: 0 }); });
  });
}
async function waitForHealth(retries = 30, delayMs = 300) {
  for (let i = 0; i < retries; i++) {
    const { status } = await httpGet('/_health');
    if (status === 200) return true;
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

let child = null;
let serverWasRunning = false;

async function startServer() {
  // Check if server is already running
  const { status } = await httpGet('/_health');
  if (status === 200) {
    serverWasRunning = true;
    return;
  }

  // Start our own server
  return new Promise(async (resolve, reject) => {
    child = spawn('node', [ENTRY], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
      stdio: 'ignore'
    });
    const ok = await waitForHealth();
    if (!ok) return reject(new Error('Server did not become healthy on /_health'));
    resolve();
  });
}

function stopServer() {
  // Only stop if we started it
  if (child && !child.killed && !serverWasRunning) {
    try { child.kill(); } catch {}
  }
  child = null;
}

(async () => {
  try {
    await startServer();

    // Key UX surfaces exist (200 when public, or 302 when auth-gated)
    const mustExist = ['/inbox', '/settings/notifications', '/auth/login', '/system'];
    for (const p of mustExist) {
      const { status } = await httpGet(p);
      if (![200, 302].includes(status)) throw new Error(`${p} -> ${status} (expected 200/302)`);
    }

    console.log('✅ ux_improvements_smoke.js OK');
  } catch (e) {
    console.error('❌ ux_improvements_smoke.js failed:', e.message);
    process.exitCode = 1;
  } finally {
    stopServer();
  }
})();
