// scripts/smoke.js
// Quick health probe against local or provided base URL
// Usage: node scripts/smoke.js [baseUrl]
// Default: http://localhost:8080
const http = require('http');

const base = (process.argv[2] || process.env.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const target = `${base}/_health`;

function get(u) {
  return new Promise((resolve, reject) => {
    const req = http.get(u, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
  });
}

(async () => {
  try {
    const { status, data } = await get(target);
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const json = JSON.parse(data);
    if (!json || !json.ok) throw new Error('ok=false');
    console.log(JSON.stringify(json, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(`Smoke FAILED for ${target}:`, e?.message || e);
    process.exit(1);
  }
})();
