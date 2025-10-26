/**
 * utils/voice.js — TwiML voice helpers
 * 
 * Builds TwiML fragments with Play (if audio exists) fallback to Say.
 * Respects PUBLIC_BASE_URL; if missing, skips Play and uses Say only.
 */

const fs = require('fs');
const path = require('path');

// voice_map.json maps keys to filenames
const VOICE_MAP_PATH = path.join(__dirname, '..', 'dialogue', 'voice_map.json');
const AUDIO_DIR = path.join(__dirname, '..', 'audio');

let voiceMap = {};
try {
  if (fs.existsSync(VOICE_MAP_PATH)) {
    voiceMap = JSON.parse(fs.readFileSync(VOICE_MAP_PATH, 'utf8'));
  }
} catch (e) {
  voiceMap = {};
}

function fileExistsSync(relPath) {
  try {
    return fs.existsSync(path.join(AUDIO_DIR, relPath));
  } catch (e) {
    return false;
  }
}

// playVoiceTwiml: returns { playUrl } if audio exists and baseUrl provided, else null
// Caller should fall back to <Say> with fallbackText
function playVoiceTwiml(id, fallbackText, baseUrl) {
  if (!baseUrl) return null; // no PUBLIC_BASE_URL → skip Play
  const file = voiceMap[id];
  if (!file) return null;
  if (fileExistsSync(file)) {
    const url = `${baseUrl.replace(/\/$/, '')}/audio/${file}`;
    return { playUrl: url };
  }
  return null;
}

module.exports = { playVoiceTwiml, fileExistsSync };

