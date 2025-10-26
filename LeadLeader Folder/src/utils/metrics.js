const fs = require('fs');
const path = require('path');

// Very defensive reader for a local NDJSON metrics file (optional).
// If the file doesn't exist or is empty, we return safe defaults instead of throwing.
const METRICS_PATH = process.env.METRICS_PATH || '/tmp/metrics.jsonl';

function readLinesSafe(p) {
  try {
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) return [];
    // keep last ~1000 lines to avoid huge memory
    const lines = raw.trim().split(/\r?\n/);
    return lines.slice(-1000);
  } catch {
    return [];
  }
}

function parseNdjson(lines) {
  const out = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      out.push(obj);
    } catch {
      // skip bad line
    }
  }
  return out;
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const idx = Math.max(0, Math.min(arr.length - 1, Math.floor((p / 100) * arr.length)));
  return arr[idx];
}

function summarize() {
  const lines = readLinesSafe(METRICS_PATH);
  const entries = parseNdjson(lines);

  const now = Date.now();
  const sinceMs = 60 * 60 * 1000; // last hour
  const recent = entries.filter(e => {
    const t = new Date(e.timestamp || e.time || now).getTime();
    return now - t <= sinceMs;
  });

  const total = entries.length;
  const totalRecent = recent.length;
  const errors = recent.filter(e => (e.level || '').toLowerCase() === 'error').length;

  const latencies = recent
    .map(e => Number(e.latency_ms || e.latencyMs || e.latency || 0))
    .filter(v => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);

  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const p95 = latencies.length ? pct(latencies, 95) : 0;
  const p99 = latencies.length ? pct(latencies, 99) : 0;

  return {
    ok: true,
    source: fs.existsSync(METRICS_PATH) ? METRICS_PATH : null,
    totals: { allTime: total, lastHour: totalRecent, errorsLastHour: errors },
    latency: { avgMs: avg, p95Ms: p95, p99Ms: p99, samples: latencies.length },
    samplePreview: recent.slice(-5), // last 5 entries (for debugging)
  };
}

module.exports = { summarize };
