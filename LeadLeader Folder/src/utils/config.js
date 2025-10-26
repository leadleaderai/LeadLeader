// config/config.js
// Centralized configuration loader for LeadLeader
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env from project root if present
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parseBool(v, def = false) {
  if (v === undefined || v === null) return def;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return def;
}

// Try to parse GOOGLE_SERVICE_ACCOUNT_JSON; support raw JSON or base64-encoded
let googleServiceAccount = null;
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
  try {
    // try raw JSON
    googleServiceAccount = JSON.parse(raw);
  } catch (err1) {
    try {
      // try base64 decode then parse
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      googleServiceAccount = JSON.parse(decoded);
    } catch (err2) {
      // failed to parse; keep null and warn once
      console.warn('⚠️  config: GOOGLE_SERVICE_ACCOUNT_JSON present but could not be parsed. Sheets features may be disabled.');
      googleServiceAccount = null;
    }
  }
}

const config = {
  PORT: process.env.PORT ? Number(process.env.PORT) : 8080,
  NODE_ENV: process.env.NODE_ENV || 'development',
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || null,

  // Tenant / recipients
  TENANT_ID: process.env.TENANT_ID || 'demo',
  TENANT_TIMEZONE: process.env.TENANT_TIMEZONE || 'America/Los_Angeles',
  RECIPIENTS: process.env.RECIPIENTS ? String(process.env.RECIPIENTS).split(',').map(s => s.trim()).filter(Boolean) : ['you@example.com'],

  // Google Sheets
  SHEETS_SPREADSHEET_ID: process.env.SHEETS_SPREADSHEET_ID || null,
  GOOGLE_SERVICE_ACCOUNT_JSON: googleServiceAccount,

  // SendGrid
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || null,
  SENDGRID_FROM: process.env.SENDGRID_FROM || null,

  // AWS (Polly)
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || null,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || null,
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',

  // Misc
  CRON_SECRET: process.env.CRON_SECRET || null,

  // Identity & Security
  OWNER_USERNAME: process.env.OWNER_USERNAME || 'LeadLeaderCeo',
  OWNER_PASSWORD: process.env.OWNER_PASSWORD || null,
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  BUSINESS_PHONE: process.env.BUSINESS_PHONE || null,

  // Auth & Signup
  SIGNUP_ENABLED: parseBool(process.env.SIGNUP_ENABLED, true),
  REQUIRE_HCAPTCHA_SIGNUP: parseBool(process.env.REQUIRE_HCAPTCHA_SIGNUP, false),
  DATA_DIR: process.env.DATA_DIR || './data',

  // Feature flags
  ENABLE_TRANSCRIBE: parseBool(process.env.ENABLE_TRANSCRIBE, false),
  ENABLE_POLLY: parseBool(process.env.ENABLE_POLLY, false),
  ENABLE_SYSTEM_DASHBOARD: parseBool(process.env.ENABLE_SYSTEM_DASHBOARD, true),
  ENABLE_TEXT_CHAT: parseBool(process.env.ENABLE_TEXT_CHAT, true),

  // Anti-abuse rate limits
  CONTACT_RATE_PER_MIN: Number(process.env.CONTACT_RATE_PER_MIN) || 12,
  CONTACT_BURST: Number(process.env.CONTACT_BURST) || 6,
  CHAT_RATE_PER_MIN: Number(process.env.CHAT_RATE_PER_MIN) || 30,
  CHAT_BURST: Number(process.env.CHAT_BURST) || 10,
  IP_GLOBAL_RATE_PER_MIN: Number(process.env.IP_GLOBAL_RATE_PER_MIN) || 120,
  IP_GLOBAL_BURST: Number(process.env.IP_GLOBAL_BURST) || 60,
  ABUSE_COOLDOWN_SEC: Number(process.env.ABUSE_COOLDOWN_SEC) || 30,

  // Optional captcha
  HCAPTCHA_SITEKEY: process.env.HCAPTCHA_SITEKEY || null,
  HCAPTCHA_SECRET: process.env.HCAPTCHA_SECRET || null,
  
  // IP filtering
  IP_DENYLIST: process.env.IP_DENYLIST ? process.env.IP_DENYLIST.split(',').map(s => s.trim()).filter(Boolean) : [],
  IP_ALLOWLIST: process.env.IP_ALLOWLIST ? process.env.IP_ALLOWLIST.split(',').map(s => s.trim()).filter(Boolean) : [],

  // Build metadata
  BUILD_TIME: process.env.BUILD_TIME || null,
  COMMIT_SHA: process.env.COMMIT_SHA || null,

  // Low-level raw env (do not expose full contents)
  _raw: process.env
};

function validateFeatureDeps() {
  if (config.SENDGRID_API_KEY === null && config.SENDGRID_FROM) {
    console.warn('⚠️  SENDGRID_FROM set but SENDGRID_API_KEY is missing. Email will not be sent.');
  }
  if (config.ENABLE_TRANSCRIBE && !config.GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.warn('⚠️  ENABLE_TRANSCRIBE set but Google service account not configured.');
  }
  if (config.ENABLE_POLLY && (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY)) {
    console.warn('⚠️  ENABLE_POLLY set but AWS credentials not configured.');
  }
}

validateFeatureDeps();

function safe() {
  return {
    NODE_ENV: config.NODE_ENV,
    PORT: config.PORT,
    TENANT_ID: config.TENANT_ID,
    TENANT_TIMEZONE: config.TENANT_TIMEZONE,
    recipients_count: config.RECIPIENTS.length,
    OWNER_USERNAME: config.OWNER_USERNAME,
    SIGNUP_ENABLED: config.SIGNUP_ENABLED,
    REQUIRE_HCAPTCHA_SIGNUP: config.REQUIRE_HCAPTCHA_SIGNUP,
    HCAPTCHA_SITEKEY: config.HCAPTCHA_SITEKEY,
    FEATURES: {
      transcribe: config.ENABLE_TRANSCRIBE,
      polly: config.ENABLE_POLLY,
      validate_twilio: false, // legacy flag, always false now
      system_dashboard: config.ENABLE_SYSTEM_DASHBOARD,
      text_chat: config.ENABLE_TEXT_CHAT,
      sheets_enabled: !!(config.SHEETS_SPREADSHEET_ID && config.GOOGLE_SERVICE_ACCOUNT_JSON),
      anti_abuse: true
    }
  };
}

module.exports = config;
module.exports.safe = safe;
