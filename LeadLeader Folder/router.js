const fs = require('fs');
const path = require('path');
const dialogue = JSON.parse(fs.readFileSync(path.join(__dirname, 'dialogue.json'), 'utf8'));

function detectIntentFromText(text) {
  const lower = (text || '').toLowerCase();
  if (/(demo|showcase|walkthrough)/i.test(lower)) return 'demo';
  if (/(subscribe|subscription|plan|pricing|basic|custom)/i.test(lower)) return 'subscribe';
  if (/(appointment|schedule|meet|call back)/i.test(lower)) return 'appointment';
  return 'demo';
}

module.exports = { detectIntentFromText };
