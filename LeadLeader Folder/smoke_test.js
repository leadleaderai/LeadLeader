#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// SMOKE TESTS - Self-starting endpoint verification
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

async function expectStatus(pathname, expected) {
  const { status } = await httpGet(pathname);
  if (status !== expected) throw new Error(`${pathname} -> ${status} (expected ${expected})`);
}

(async () => {
  try {
    await startServer();

    // Public endpoints expected 200
    const public200 = [
      '/', '/_health', '/auth/login', '/auth/signup',
      '/contact', '/system', '/try', '/privacy', '/terms'
    ];
    for (const p of public200) await expectStatus(p, 200);

    // Protected endpoints expected 302 (redirect to login)
    const prot302 = ['/dashboard', '/owner/users', '/owner/logs'];
    for (const p of prot302) await expectStatus(p, 302);

    console.log('✅ smoke_test.js OK');
  } catch (e) {
    console.error('❌ smoke_test.js failed:', e.message);
    process.exitCode = 1;
  } finally {
    stopServer();
  }
})();
