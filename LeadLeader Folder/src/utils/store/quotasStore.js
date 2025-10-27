// ═══════════════════════════════════════════════════════════
// QUOTAS STORE - Per-user rate limiting by plan
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const QUOTAS_FILE = path.join(DATA_DIR, 'quotas.json');

// Plan limits
const LIMITS = {
  free: { contact_daily: 6, chat_per_min: 20 },
  pro: { contact_daily: 50, chat_per_min: 500 },
  biz: { contact_daily: 500, chat_per_min: 5000 }
};

let writeLock = Promise.resolve();

function safeQuotas(x) {
  return x && typeof x.quotasByUserId === 'object' ? x : { quotasByUserId: {} };
}

async function atomicWrite(file, content) {
  const tmp = `${file}.tmp-${Date.now()}`;
  await fsp.writeFile(tmp, content, 'utf8');
  await fsp.rename(tmp, file);
}

async function initStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(QUOTAS_FILE);
  } catch {
    await atomicWrite(QUOTAS_FILE, JSON.stringify({ quotasByUserId: {} }, null, 2));
  }
}

async function readAll() {
  await initStore();
  const content = await fsp.readFile(QUOTAS_FILE, 'utf8');
  return safeQuotas(JSON.parse(content));
}

async function writeAll(data) {
  await atomicWrite(QUOTAS_FILE, JSON.stringify(data, null, 2));
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function getCurrentMinute() {
  return Math.floor(Date.now() / 60000);
}

/**
 * Record hit and check if allowed
 * @param {object} params - { userId, kind ('contact'|'chat'), plan ('free'|'pro'|'biz') }
 * @returns {Promise<object>} { allowed: boolean, retryAfter: number }
 */
async function recordHit({ userId, kind, plan }) {
  return writeLock = writeLock.then(async () => {
    const db = await readAll();
    const userQuotas = db.quotasByUserId[userId] || { contact: {}, chat: {} };
    
    if (kind === 'contact') {
      const today = getTodayKey();
      const limit = LIMITS[plan]?.contact_daily || LIMITS.free.contact_daily;
      
      if (!userQuotas.contact[today]) {
        userQuotas.contact[today] = 0;
      }
      
      // Clean old days (keep only today)
      Object.keys(userQuotas.contact).forEach(day => {
        if (day !== today) delete userQuotas.contact[day];
      });
      
      if (userQuotas.contact[today] >= limit) {
        const tomorrow = new Date();
        tomorrow.setUTCHours(24, 0, 0, 0);
        const retryAfter = Math.ceil((tomorrow - Date.now()) / 1000);
        return { allowed: false, retryAfter };
      }
      
      userQuotas.contact[today]++;
      db.quotasByUserId[userId] = userQuotas;
      await writeAll(db);
      
      return { allowed: true, retryAfter: 0 };
    }
    
    if (kind === 'chat') {
      const currentMin = getCurrentMinute();
      const limit = LIMITS[plan]?.chat_per_min || LIMITS.free.chat_per_min;
      
      if (!userQuotas.chat[currentMin]) {
        userQuotas.chat[currentMin] = 0;
      }
      
      // Clean old minutes (keep only current)
      Object.keys(userQuotas.chat).forEach(min => {
        if (parseInt(min) < currentMin) delete userQuotas.chat[min];
      });
      
      if (userQuotas.chat[currentMin] >= limit) {
        const retryAfter = 60; // Next minute
        return { allowed: false, retryAfter };
      }
      
      userQuotas.chat[currentMin]++;
      db.quotasByUserId[userId] = userQuotas;
      await writeAll(db);
      
      return { allowed: true, retryAfter: 0 };
    }
    
    return { allowed: true, retryAfter: 0 };
  });
}

module.exports = {
  recordHit,
  initStore
};
