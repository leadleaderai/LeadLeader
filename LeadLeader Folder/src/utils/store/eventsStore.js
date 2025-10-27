// ═══════════════════════════════════════════════════════════
// EVENTS STORE - In-app activity feed
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const MAX_EVENTS = 50000; // Trim if exceeded

let writeLock = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function safeEvents(x) {
  return x && Array.isArray(x.events) ? x : { events: [] };
}

async function atomicWrite(file, content) {
  const tmp = `${file}.tmp-${Date.now()}`;
  await fsp.writeFile(tmp, content, 'utf8');
  await fsp.rename(tmp, file);
}

async function initStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(EVENTS_FILE);
  } catch {
    await atomicWrite(EVENTS_FILE, JSON.stringify({ events: [] }, null, 2));
  }
}

async function readAll() {
  await initStore();
  const content = await fsp.readFile(EVENTS_FILE, 'utf8');
  return safeEvents(JSON.parse(content));
}

async function writeAll(data) {
  await atomicWrite(EVENTS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Append event to feed
 * @param {object} event - { userId, type, payload, createdAt? }
 * @returns {Promise<object>} Created event with id
 */
async function appendEvent({ userId, type, payload, createdAt }) {
  return writeLock = writeLock.then(async () => {
    const db = await readAll();
    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    const event = {
      id,
      userId: userId || null,
      type,
      payload,
      createdAt: createdAt || nowIso()
    };
    
    db.events.push(event);
    
    // Trim if too large (keep newest MAX_EVENTS)
    if (db.events.length > MAX_EVENTS) {
      db.events = db.events.slice(-MAX_EVENTS);
    }
    
    await writeAll(db);
    return event;
  });
}

/**
 * List events for a user
 * @param {string|null} userId 
 * @param {object} options - { limit=50, offset=0 }
 * @returns {Promise<object>} { items, nextOffset? }
 */
async function listEventsByUser(userId, { limit = 50, offset = 0 } = {}) {
  const db = await readAll();
  
  const userEvents = db.events.filter(e => e.userId === userId);
  const items = userEvents.slice(offset, offset + limit);
  const nextOffset = (offset + limit < userEvents.length) ? offset + limit : null;
  
  return { items, nextOffset };
}

/**
 * List all events (owner only)
 * @param {object} options - { limit=50, offset=0 }
 * @returns {Promise<object>} { items, nextOffset? }
 */
async function listAllEvents({ limit = 50, offset = 0 } = {}) {
  const db = await readAll();
  const items = db.events.slice(offset, offset + limit);
  const nextOffset = (offset + limit < db.events.length) ? offset + limit : null;
  
  return { items, nextOffset };
}

module.exports = {
  appendEvent,
  listEventsByUser,
  listAllEvents,
  initStore
};
