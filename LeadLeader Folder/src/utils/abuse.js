// ═══════════════════════════════════════════════════════════
// ABUSE.JS - Lightweight in-memory anti-abuse system
// ═══════════════════════════════════════════════════════════
// Token bucket rate limiter, cooldowns, honeypot, hCaptcha

const config = require('./config');
const https = require('https');

// ───────────────────────────────────────────────
// Token Bucket Rate Limiter
// ───────────────────────────────────────────────
function makeLimiter({ ratePerMin, burst }) {
  const buckets = new Map(); // key -> { tokens, lastRefill }
  const refillRate = ratePerMin / 60000; // tokens per ms

  return {
    allow(key) {
      const now = Date.now();
      
      if (!buckets.has(key)) {
        buckets.set(key, { tokens: burst - 1, lastRefill: now });
        return { ok: true, retryAfterSec: 0 };
      }

      const bucket = buckets.get(key);
      const elapsed = now - bucket.lastRefill;
      const newTokens = elapsed * refillRate;
      
      bucket.tokens = Math.min(burst, bucket.tokens + newTokens);
      bucket.lastRefill = now;

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return { ok: true, retryAfterSec: 0 };
      }

      // Rejected - calculate retry time
      const tokensNeeded = 1 - bucket.tokens;
      const retryMs = tokensNeeded / refillRate;
      const retryAfterSec = Math.ceil(retryMs / 1000);
      
      return { ok: false, retryAfterSec };
    }
  };
}

// ───────────────────────────────────────────────
// Initialize Limiters
// ───────────────────────────────────────────────
const globalLimiter = makeLimiter({
  ratePerMin: config.IP_GLOBAL_RATE_PER_MIN,
  burst: config.IP_GLOBAL_BURST
});

const contactLimiter = makeLimiter({
  ratePerMin: config.CONTACT_RATE_PER_MIN,
  burst: config.CONTACT_BURST
});

const chatLimiter = makeLimiter({
  ratePerMin: config.CHAT_RATE_PER_MIN,
  burst: config.CHAT_BURST
});

const loginLimiter = makeLimiter({
  ratePerMin: 5,
  burst: 3
});

const signupLimiter = makeLimiter({
  ratePerMin: 8,
  burst: 4
});

// ───────────────────────────────────────────────
// Cooldown tracking
// ───────────────────────────────────────────────
const cooldownUntil = new Map(); // key -> timestamp

function isInCooldown(key) {
  const until = cooldownUntil.get(key);
  if (!until) return false;
  if (Date.now() < until) return true;
  cooldownUntil.delete(key);
  return false;
}

function setCooldown(key) {
  cooldownUntil.set(key, Date.now() + config.ABUSE_COOLDOWN_SEC * 1000);
}

// ───────────────────────────────────────────────
// IP filtering
// ───────────────────────────────────────────────
const allowlist = new Set(config.IP_ALLOWLIST);
const denylist = new Set(config.IP_DENYLIST);

function isAllowed(ip) {
  if (denylist.has(ip)) return false;
  if (allowlist.size > 0 && !allowlist.has(ip)) return false;
  return true;
}

// ───────────────────────────────────────────────
// Metrics and error tracking
// ───────────────────────────────────────────────
const counters = {
  emailsSentOk: 0,
  emailsSentErr: 0,
  sheetsOk: 0,
  sheetsErr: 0,
  uploads: 0,
  chatTurns: 0
};

const latencyRing = []; // { ts, method, path, status, ms }
const MAX_LATENCY_SAMPLES = 500;

const errorsRing = []; // strings only
const MAX_ERRORS = 50;

function incCounter(name) {
  if (counters[name] !== undefined) {
    counters[name]++;
  }
}

function recordError(msg) {
  // Strip any potential secrets/PII
  const safe = String(msg).substring(0, 200);
  errorsRing.push({ ts: new Date().toISOString(), msg: safe });
  if (errorsRing.length > MAX_ERRORS) {
    errorsRing.shift();
  }
}

function recordLatency(data) {
  latencyRing.push(data);
  if (latencyRing.length > MAX_LATENCY_SAMPLES) {
    latencyRing.shift();
  }
}

// ───────────────────────────────────────────────
// Statistics snapshot
// ───────────────────────────────────────────────
function getStatsSnapshot() {
  const latencies = latencyRing.map(r => r.ms).sort((a, b) => a - b);
  const p95Idx = Math.floor(latencies.length * 0.95);
  
  const routeStats = {};
  latencyRing.forEach(r => {
    const key = `${r.method} ${r.path}`;
    if (!routeStats[key]) {
      routeStats[key] = { count: 0, total: 0, latencies: [] };
    }
    routeStats[key].count++;
    routeStats[key].total += r.ms;
    routeStats[key].latencies.push(r.ms);
  });

  const topRoutes = Object.entries(routeStats)
    .map(([route, stats]) => {
      const sorted = stats.latencies.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      return {
        route,
        count: stats.count,
        avg: stats.total / stats.count,
        p95
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const now = Date.now();
  const last5min = latencyRing.filter(r => now - r.ts < 5 * 60 * 1000).length;
  const last15min = latencyRing.filter(r => now - r.ts < 15 * 60 * 1000).length;

  return {
    counters: { ...counters },
    latency: {
      avg: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      p95: latencies[p95Idx] || 0,
      samples: latencies.length
    },
    traffic: {
      last5min,
      last15min
    },
    topRoutes,
    errors: [...errorsRing]
  };
}

// ───────────────────────────────────────────────
// hCaptcha verification
// ───────────────────────────────────────────────
async function verifyHCaptcha(token, remoteip) {
  if (!config.HCAPTCHA_SECRET) return true; // disabled
  
  return new Promise((resolve) => {
    const postData = new URLSearchParams({
      secret: config.HCAPTCHA_SECRET,
      response: token,
      remoteip
    }).toString();

    const options = {
      hostname: 'hcaptcha.com',
      path: '/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.success === true);
        } catch (err) {
          recordError('hcaptcha_parse_error');
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      recordError(`hcaptcha_request_error:${err.message}`);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

// ───────────────────────────────────────────────
// Middleware: Global guard
// ───────────────────────────────────────────────
function globalGuard(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  
  // Check IP filtering
  if (!isAllowed(ip)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  // Check cooldown
  if (isInCooldown(ip)) {
    return res.status(429).json({
      ok: false,
      error: 'rate_limited',
      retryAfter: config.ABUSE_COOLDOWN_SEC
    });
  }

  // Check global rate limit
  const result = globalLimiter.allow(ip);
  if (!result.ok) {
    setCooldown(ip);
    res.set('Retry-After', String(result.retryAfterSec));
    return res.status(429).json({
      ok: false,
      error: 'rate_limited',
      retryAfter: result.retryAfterSec
    });
  }

  next();
}

// ───────────────────────────────────────────────
// Middleware: Contact rate limit
// ───────────────────────────────────────────────
function limitContact(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  
  // Session interval check
  if (req.session && req.session.lastContactAt) {
    const elapsed = Date.now() - req.session.lastContactAt;
    if (elapsed < 5000) { // 5 seconds minimum
      return res.status(429).json({
        ok: false,
        error: 'rate_limited',
        retryAfter: Math.ceil((5000 - elapsed) / 1000)
      });
    }
  }

  const result = contactLimiter.allow(ip);
  if (!result.ok) {
    res.set('Retry-After', String(result.retryAfterSec));
    return res.status(429).json({
      ok: false,
      error: 'rate_limited',
      retryAfter: result.retryAfterSec
    });
  }

  // Update session timestamp
  if (req.session) {
    req.session.lastContactAt = Date.now();
  }

  next();
}

// ───────────────────────────────────────────────
// Middleware: Chat rate limit
// ───────────────────────────────────────────────
function limitChat(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  
  // Session interval check
  if (req.session && req.session.lastChatAt) {
    const elapsed = Date.now() - req.session.lastChatAt;
    if (elapsed < 1000) { // 1 second minimum
      return res.status(429).json({
        ok: false,
        error: 'rate_limited',
        retryAfter: 1
      });
    }
  }

  const result = chatLimiter.allow(ip);
  if (!result.ok) {
    res.set('Retry-After', String(result.retryAfterSec));
    return res.status(429).json({
      ok: false,
      error: 'rate_limited',
      retryAfter: result.retryAfterSec
    });
  }

  // Update session timestamp
  if (req.session) {
    req.session.lastChatAt = Date.now();
  }

  next();
}

// ───────────────────────────────────────────────
// Middleware: Login rate limit
// ───────────────────────────────────────────────
function limitLogin(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const result = loginLimiter.allow(ip);
  
  if (!result.ok) {
    res.set('Retry-After', String(result.retryAfterSec));
    return res.status(429).json({
      ok: false,
      error: 'rate_limited',
      retryAfter: result.retryAfterSec
    });
  }

  next();
}

// ───────────────────────────────────────────────
// Middleware: Signup rate limit
// ───────────────────────────────────────────────
function limitSignup(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const result = signupLimiter.allow(ip);
  
  if (!result.ok) {
    res.set('Retry-After', String(result.retryAfterSec));
    return res.status(429).json({
      ok: false,
      error: 'rate_limited',
      retryAfter: result.retryAfterSec
    });
  }

  next();
}

module.exports = {
  globalGuard,
  limitContact,
  limitChat,
  limitLogin,
  limitSignup,
  verifyHCaptcha,
  recordError,
  incCounter,
  recordLatency,
  getStatsSnapshot
};
