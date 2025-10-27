// ═══════════════════════════════════════════════════════════
// PREFERENCES STORE - User notification settings
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const PREFS_FILE = path.join(DATA_DIR, 'prefs.json');

let writeLock = Promise.resolve();

function safePrefs(x) {
  return x && typeof x.prefsByUserId === 'object' ? x : { prefsByUserId: {} };
}

async function atomicWrite(file, content) {
  const tmp = `${file}.tmp-${Date.now()}`;
  await fsp.writeFile(tmp, content, 'utf8');
  await fsp.rename(tmp, file);
}

async function initStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(PREFS_FILE);
  } catch {
    await atomicWrite(PREFS_FILE, JSON.stringify({ prefsByUserId: {} }, null, 2));
  }
}

async function readAll() {
  await initStore();
  const content = await fsp.readFile(PREFS_FILE, 'utf8');
  return safePrefs(JSON.parse(content));
}

async function writeAll(data) {
  await atomicWrite(PREFS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Get preferences for user
 * @param {string} userId 
 * @returns {Promise<object>} { emailEnabled, inAppEnabled, digestCadence }
 */
async function getPrefs(userId) {
  const db = await readAll();
  return db.prefsByUserId[userId] || {
    emailEnabled: false,
    inAppEnabled: true,
    digestCadence: 'none'
  };
}

/**
 * Set preferences for user
 * @param {string} userId 
 * @param {object} partial - { emailEnabled?, inAppEnabled?, digestCadence? }
 * @returns {Promise<object>} Updated prefs
 */
async function setPrefs(userId, partial) {
  return writeLock = writeLock.then(async () => {
    const db = await readAll();
    
    const current = db.prefsByUserId[userId] || {
      emailEnabled: false,
      inAppEnabled: true,
      digestCadence: 'none'
    };
    
    db.prefsByUserId[userId] = {
      ...current,
      ...partial
    };
    
    await writeAll(db);
    return db.prefsByUserId[userId];
  });
}

module.exports = {
  getPrefs,
  setPrefs,
  initStore
};
