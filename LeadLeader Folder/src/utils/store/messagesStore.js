// ═══════════════════════════════════════════════════════════
// MESSAGES STORE - Owner DMs to users
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const MAX_MESSAGES = 10000;

let writeLock = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function safeMessages(x) {
  return x && Array.isArray(x.messages) ? x : { messages: [] };
}

async function atomicWrite(file, content) {
  const tmp = `${file}.tmp-${Date.now()}`;
  await fsp.writeFile(tmp, content, 'utf8');
  await fsp.rename(tmp, file);
}

async function initStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(MESSAGES_FILE);
  } catch {
    await atomicWrite(MESSAGES_FILE, JSON.stringify({ messages: [] }, null, 2));
  }
}

async function readAll() {
  await initStore();
  const content = await fsp.readFile(MESSAGES_FILE, 'utf8');
  return safeMessages(JSON.parse(content));
}

async function writeAll(data) {
  await atomicWrite(MESSAGES_FILE, JSON.stringify(data, null, 2));
}

/**
 * Send message from owner to user
 * @param {object} msg - { fromUserId, toUserId, body, createdAt? }
 * @returns {Promise<object>} Created message with id
 */
async function sendMessage({ fromUserId, toUserId, body, createdAt }) {
  return writeLock = writeLock.then(async () => {
    const db = await readAll();
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    const message = {
      id,
      fromUserId: fromUserId || null, // null = Owner
      toUserId,
      body,
      read: false,
      createdAt: createdAt || nowIso()
    };
    
    db.messages.push(message);
    
    // Trim if too large
    if (db.messages.length > MAX_MESSAGES) {
      db.messages = db.messages.slice(-MAX_MESSAGES);
    }
    
    await writeAll(db);
    return message;
  });
}

/**
 * List messages for a user (newest first)
 * @param {string} userId 
 * @param {object} options - { limit=50, offset=0 }
 * @returns {Promise<object>} { items, nextOffset? }
 */
async function listMessagesFor(userId, { limit = 50, offset = 0 } = {}) {
  const db = await readAll();
  
  const userMessages = db.messages
    .filter(m => m.toUserId === userId)
    .reverse(); // Newest first
  
  const items = userMessages.slice(offset, offset + limit);
  const nextOffset = (offset + limit < userMessages.length) ? offset + limit : null;
  
  return { items, nextOffset };
}

/**
 * Mark messages as read
 * @param {object} params - { userId, messageIds }
 * @returns {Promise<number>} Count marked
 */
async function markRead({ userId, messageIds }) {
  return writeLock = writeLock.then(async () => {
    const db = await readAll();
    let count = 0;
    
    for (const msg of db.messages) {
      if (msg.toUserId === userId && messageIds.includes(msg.id) && !msg.read) {
        msg.read = true;
        count++;
      }
    }
    
    if (count > 0) {
      await writeAll(db);
    }
    
    return count;
  });
}

/**
 * Mark ALL messages as read for a user (idempotent)
 * @param {string} userId 
 * @returns {Promise<number>} Count marked
 */
async function markAllRead(userId) {
  return writeLock = writeLock.then(async () => {
    const db = await readAll();
    let count = 0;
    
    for (const msg of db.messages) {
      if (msg.toUserId === userId && !msg.read) {
        msg.read = true;
        count++;
      }
    }
    
    if (count > 0) {
      await writeAll(db);
    }
    
    return count;
  });
}

/**
 * Get unread count for a user (fast, no pagination)
 * @param {string} userId 
 * @returns {Promise<number>}
 */
async function getUnreadCount(userId) {
  const db = await readAll();
  return db.messages.filter(m => m.toUserId === userId && !m.read).length;
}

module.exports = {
  sendMessage,
  listMessagesFor,
  markRead,
  markAllRead,
  getUnreadCount,
  initStore
};
