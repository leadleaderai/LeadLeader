const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'app.ndjson');
const LOG_FILE_OLD = path.join(LOGS_DIR, 'app.ndjson.old');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

// Ensure logs directory exists
try {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log(JSON.stringify({ level: 'info', event: 'logs_dir_created', path: LOGS_DIR }));
} catch (err) {
  console.error(JSON.stringify({ level: 'error', event: 'logs_dir_failed', error: err.message }));
}

/**
 * Redact secrets from log data
 */
function redactSecrets(obj) {
  const str = JSON.stringify(obj);
  const redacted = str
    .replace(/SG\.[A-Za-z0-9_-]+/g, '[REDACTED_SG]')
    .replace(/AKIA[A-Z0-9]{16}/g, '[REDACTED_AWS]')
    .replace(/sk-[A-Za-z0-9]{48}/g, '[REDACTED_SK]')
    .replace(/"password":"[^"]+"/g, '"password":"[REDACTED]"')
    .replace(/"passHash":"[^"]+"/g, '"passHash":"[REDACTED]"')
    .replace(/"secret":"[^"]+"/g, '"secret":"[REDACTED]"');
  return JSON.parse(redacted);
}

/**
 * Rotate log file if it exceeds max size
 */
function rotateIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        // Move current to .old (overwrite old backup)
        if (fs.existsSync(LOG_FILE_OLD)) {
          fs.unlinkSync(LOG_FILE_OLD);
        }
        fs.renameSync(LOG_FILE, LOG_FILE_OLD);
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'log_rotation_failed', error: err.message }));
  }
}

function log(type, data) {
  const entry = {
    ts: new Date().toISOString(),
    type,
    ...data
  };
  
  try {
    rotateIfNeeded();
    const safeEntry = redactSecrets(entry);
    fs.appendFileSync(LOG_FILE, JSON.stringify(safeEntry) + '\n', 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'log_write_failed', error: err.message }));
  }
}

async function tail(lines = 200) {
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const allLines = content.trim().split('\n').filter(Boolean);
    return allLines.slice(-lines);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

module.exports = { log, tail, LOG_FILE };
