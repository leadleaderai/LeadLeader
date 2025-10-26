/**
 * router.js — Intent detection and data extraction utilities
 * 
 * Deterministic regex-based routing (no ML for MVP).
 * Functions:
 * - detectIntentFromText: Returns intent string (demo|subscribe|appointment)
 * - extractPhoneDigits: Strips non-digits from speech
 * - isLikelyTimePhrase: Cheap heuristic for time expressions
 */

const fs = require('fs');
const path = require('path');

function detectIntentFromText(text) {
  const lower = (text || '').toLowerCase();
  if (/(demo|showcase|walkthrough|show me)/i.test(lower)) return 'demo';
  if (/(subscribe|subscription|plan|pricing|basic|custom|sign up)/i.test(lower)) return 'subscribe';
  if (/(appointment|schedule|meet|call back|meeting)/i.test(lower)) return 'appointment';
  return 'demo'; // default
}

function extractPhoneDigits(text) {
  const digits = (text || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

function isLikelyTimePhrase(text) {
  const lower = (text || '').toLowerCase();
  // Cheap heuristic: contains time keywords
  return /(morning|afternoon|evening|today|tomorrow|monday|tuesday|wednesday|thursday|friday|\d+\s*(am|pm|o'clock))/i.test(lower);
}

module.exports = { detectIntentFromText, extractPhoneDigits, isLikelyTimePhrase };

