const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'app.ndjson');

// Ensure logs directory exists
try {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log(JSON.stringify({ level: 'info', event: 'logs_dir_created', path: LOGS_DIR }));
} catch (err) {
  console.error(JSON.stringify({ level: 'error', event: 'logs_dir_failed', error: err.message }));
}

function log(type, data) {
  const entry = {
    ts: new Date().toISOString(),
    type,
    ...data
  };
  
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
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
