// scripts/dev-bootstrap.js
// One-command local bootstrap: install -> husky -> start -> poll /_health
// Usage: node scripts/dev-bootstrap.js
const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || '8080';
const KEEP_ALIVE = process.env.KEEP_SERVER_ALIVE === '1';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'pipe', shell: false, ...opts });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += d.toString(); process.stdout.write(d); });
    p.stderr.on('data', d => { stderr += d.toString(); process.stderr.write(d); });
    p.on('close', code => code === 0 ? resolve({ stdout, stderr, code }) : reject(Object.assign(new Error(`${cmd} ${args.join(' ')} exited ${code}`), { stdout, stderr, code })));
  });
}

async function pollHealth(timeoutMs = 30000, intervalMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  const url = `http://localhost:${PORT}/_health`;
  while (Date.now() < deadline) {
    try {
      const body = await new Promise((res, rej) => {
        const req = http.get(url, r => {
          let data = '';
          r.on('data', c => data += c);
          r.on('end', () => res({ status: r.statusCode, data }));
        });
        req.on('error', rej);
      });
      if (body.status === 200) {
        try {
          const json = JSON.parse(body.data);
          if (json && json.ok) return json;
        } catch (_) {}
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Health check failed after ${timeoutMs}ms at /_health on port ${PORT}`);
}

(async () => {
  console.log(`\n==> Bootstrapping on PORT=${PORT}\n`);

  // 1) Install deps (ci -> install fallback)
  try {
    await run('npm', ['ci'], { env: process.env });
  } catch {
    console.warn('npm ci failed, falling back to npm install…');
    await run('npm', ['install'], { env: process.env });
  }

  // 2) Husky prepare (safe if already installed)
  try {
    await run('npm', ['run', 'prepare'], { env: process.env });
  } catch (e) {
    console.warn('Husky prepare failed (continuing):', e?.message || e);
  }

  // 3) Start server
  console.log('\n==> Starting server…');
  const serverEnv = { ...process.env, PORT };
  const server = spawn(process.platform === 'win32' ? 'node.exe' : 'node', ['index.js'], {
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  let buf = '';
  server.stdout.on('data', d => { buf += d.toString(); process.stdout.write(d); });
  server.stderr.on('data', d => { buf += d.toString(); process.stderr.write(d); });

  // 4) Poll health
  try {
    const health = await pollHealth();
    console.log('\n==> /_health OK:\n', JSON.stringify(health, null, 2));
    if (!KEEP_ALIVE) {
      server.kill('SIGTERM');
    } else {
      console.log('\nKEEP_SERVER_ALIVE=1 set; leaving server running.');
    }
    process.exit(0);
  } catch (err) {
    console.error('\n==> Health check FAILED.\nRecent logs:\n', buf.split('\n').slice(-60).join('\n'));
    try { server.kill('SIGTERM'); } catch {}
    process.exit(1);
  }
})().catch(e => {
  console.error('Bootstrap error:', e);
  process.exit(1);
});
