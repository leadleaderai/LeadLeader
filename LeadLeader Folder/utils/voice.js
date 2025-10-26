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

// playVoiceTwiml: returns an object { playUrl } or null
// The calling code can decide how to render TwiML (<Play> or <Say>)
function playVoiceTwiml(id, fallbackText, baseUrl) {
  const file = voiceMap[id];
  if (!file) return null;
  if (fileExistsSync(file)) {
    const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/audio/${file}` : `/audio/${file}`;
    return { playUrl: url };
  }
  return null;
}

module.exports = { playVoiceTwiml, fileExistsSync };
