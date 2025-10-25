const fs = require('fs');
const path = require('path');

const dialogue = JSON.parse(fs.readFileSync(path.join(__dirname, 'dialogue.json'), 'utf8'));

function getResponse(speechResult) {
  const lower = (speechResult || '').toLowerCase();

  if (lower.includes('refinance')) return dialogue.refinance;
  if (lower.includes('loan') || lower.includes('mortgage')) return dialogue.loan;
  if (lower.includes('appointment') || lower.includes('schedule')) return dialogue.appointment;
  if (lower.includes('price') || lower.includes('cost')) return dialogue.pricing;

  return dialogue.unknown;
}

module.exports = { getResponse };
