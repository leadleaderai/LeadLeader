/**
 * index.js — LeadLeader Express Server
 * 
 * Handles Twilio Voice webhooks for a voice receptionist that:
 * - Greets callers with consent notice
 * - Gathers intent (demo|subscribe|appointment)
 * - Collects: name, phone, preferred time, optional plan
 * - Triggers non-blocking aftercall pipeline (Sheets/Email/Calendar)
 * - Minimal structured logging
 */

const express = require('express');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
const { detectIntentFromText } = require('./router');
const { config, safe } = require('./config/config');
const voice = require('./utils/voice');
const aftercall = require('./aftercall');
const { google } = require('googleapis');
const sgMail = require('@sendgrid/mail');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();

// Trust proxy for X-Forwarded-* headers (Fly.io)
app.set('trust proxy', 1);

// Body parsers with limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static audio
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// --- Structured logging helper ---
function log(level, route, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    route,
    tenant: config.TENANT_ID,
    timezone: config.TENANT_TIMEZONE,
    ...data
  };
  console.log(JSON.stringify(entry));
}

// --- Twilio signature validation (optional) ---
let signatureValidationWarned = false;
function validateTwilioRequest(req) {
  if (!config.VALIDATE_TWILIO_SIGNATURE) {
    if (!signatureValidationWarned) {
      log('warn', 'middleware', { message: 'Twilio signature validation disabled' });
      signatureValidationWarned = true;
    }
    return true;
  }
  // TODO(sonnet): Implement full twilio.validateRequest() when enabled
  return true;
}

// --- helpers ---
function normalizeResult(result) {
  // Supports old router (returns string) and new router (returns { text, intent })
  if (typeof result === 'string') {
    const text = result;
    // Heuristic: treat any variant of "could you rephrase" as unknown
    const isUnknown = text.toLowerCase().includes('could you rephrase');
    return { text, intent: isUnknown ? 'unknown' : 'normal' };
  }
  // Already structured
  const { text, intent } = result || {};
  return { text: text || 'Sorry, I didn't catch that. Could you rephrase?', intent: intent || 'unknown' };
}

function sayLine(vr, line) {
  // keep simple text for now (SSML optional later)
  vr.say({ voice: 'Polly.Joanna' }, line);
}

// --- health check ---
app.get('/', (req, res) => {
  res.send('LeadLeader OK');
});

// health endpoint required by docs
app.get('/_health', (req, res) => {
  return res.json({ ok: true, uptime: process.uptime(), env: safe() });
});

// --- helpers ---
function normalizeResult(result) {
  // Supports old router (returns string) and new router (returns { text, intent })
  if (typeof result === 'string') {
    const text = result;
    // Heuristic: treat any variant of "could you rephrase" as unknown
    const isUnknown = text.toLowerCase().includes('could you rephrase');
    return { text, intent: isUnknown ? 'unknown' : 'normal' };
  }
  // Already structured
  const { text, intent } = result || {};
  return { text: text || 'Sorry, I didn’t catch that. Could you rephrase?', intent: intent || 'unknown' };
}

function sayLine(vr, line) {
  // keep simple text for now (SSML optional later)
  vr.say({ voice: 'Polly.Joanna' }, line);
}

// --- health check ---
app.get('/', (req, res) => {
  res.send('✅ LeadLeader Voice Bot is running. Point your Twilio webhook to /voice');
});

// health endpoint required by docs
app.get('/_health', (req, res) => {
  return res.json({ ok: true, uptime: process.uptime(), env: safe() });
});

// helper to return TwiML with Play fallback to Say
function playOrSay(twiml, key) {
  const base = config.PUBLIC_BASE_URL ? config.PUBLIC_BASE_URL.replace(/\/$/, '') : '';
  const snippet = voice.playVoiceTwiml(key, null, base);
  // snippet is a twiml fragment (string) — return it as raw XML via TwiML's Response
  return snippet;
}

// --- initial inbound call ---
app.post('/voice', (req, res) => {
  if (!validateTwilioRequest(req)) {
    log('warn', '/voice', { message: 'Invalid Twilio signature', from: req.body.From });
    return res.status(403).send('Forbidden');
  }

  const callSid = req.body.CallSid;
  log('info', '/voice', { callSid, from: req.body.From });

  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/handle?step=1',
    method: 'POST'
  });

  // Greeting
  gather.say({ voice: 'Polly.Joanna' }, 'Hey there, this is LeadLeader.');

  // Short consent notice (PHASE 2 requirement)
  gather.say({ voice: 'Polly.Joanna' }, 'This call may be recorded. We only store transcripts, not raw audio. Continuing means you agree.');

  // Fallback if no input
  twiml.say({ voice: 'Polly.Joanna' }, 'Thanks for calling. Goodbye.');
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
});

// --- main step handler ---
// Multi-step voice handler using query params to carry state between steps
app.post('/handle', (req, res) => {
  if (!validateTwilioRequest(req)) {
    return res.status(403).send('Forbidden');
  }

  const step = Number(req.query.step || '1');
  const prev = req.query || {};
  const speech = req.body.SpeechResult || '';
  const callSid = req.body.CallSid;
  const twiml = new twilio.twiml.VoiceResponse();

  // carry state via query params appended to action URLs
  const state = {
    intent: prev.intent || '',
    caller_name: prev.caller_name || '',
    callback_number: prev.callback_number || '',
    preferred_time: prev.preferred_time || '',
    plan_interest: prev.plan_interest || ''
  };

  // assign last speech to the last asked field
  if (step > 1 && speech) {
    if (!state.intent) state.intent = detectIntentFromText(speech) || state.intent;
    else if (!state.caller_name) state.caller_name = speech;
    else if (!state.callback_number) state.callback_number = speech;
    else if (!state.preferred_time) state.preferred_time = speech;
    else if (!state.plan_interest) state.plan_interest = speech;
  }

  function buildAction(nextStep, overrides = {}) {
    const params = Object.assign({}, state, overrides);
    const qs = Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]||'')}`).join('&');
    return `/handle?step=${nextStep}&${qs}`;
  }

  log('info', '/handle', { callSid, step, speech: speech.substring(0, 50) });

  // step prompts
  if (step === 1) {
    const gather = twiml.gather({ input: 'speech', speechTimeout: 'auto', action: buildAction(2), method: 'POST' });
    gather.say({ voice: 'Polly.Joanna' }, 'Are you calling for a demo, subscription, or to set an appointment?');
    return res.type('text/xml').send(twiml.toString());
  }

  if (step === 2) {
    // we just received intent
    state.intent = detectIntentFromText(speech) || state.intent || 'demo';
    const gather = twiml.gather({ input: 'speech', speechTimeout: 'auto', action: buildAction(3), method: 'POST' });
    gather.say({ voice: 'Polly.Joanna' }, 'Great. What is your name?');
    return res.type('text/xml').send(twiml.toString());
  }

  if (step === 3) {
    state.caller_name = speech || state.caller_name;
    const gather = twiml.gather({ input: 'speech', speechTimeout: 'auto', action: buildAction(4), method: 'POST' });
    gather.say({ voice: 'Polly.Joanna' }, 'What is the best number to reach you?');
    return res.type('text/xml').send(twiml.toString());
  }

  if (step === 4) {
    state.callback_number = speech || state.callback_number;
    const gather = twiml.gather({ input: 'speech', speechTimeout: 'auto', action: buildAction(5), method: 'POST' });
    gather.say({ voice: 'Polly.Joanna' }, 'When is a good time for a quick call?');
    return res.type('text/xml').send(twiml.toString());
  }

  if (step === 5) {
    state.preferred_time = speech || state.preferred_time;
    // if subscribe, ask plan
    if (state.intent && state.intent.toLowerCase().includes('sub')) {
      const gather = twiml.gather({ input: 'speech', speechTimeout: 'auto', action: buildAction(6), method: 'POST' });
      gather.say({ voice: 'Polly.Joanna' }, 'For subscription, are you thinking Basic or Custom?');
      return res.type('text/xml').send(twiml.toString());
    }
    // else finish
    // send to aftercall
    const payload = {
      intent: state.intent || 'demo',
      caller_name: state.caller_name || 'Unknown',
      callback_number: state.callback_number || '',
      preferred_time: state.preferred_time || '',
      plan_interest: '',
      timestamp: new Date().toISOString(),
      priority: state.intent && state.intent.toLowerCase().includes('sub')
    };
    // notify aftercall async (non-blocking)
    aftercall.handleAfterCall(payload, config).catch(e => log('error', '/handle', { message: 'aftercall failed', error: e.message, callSid }));
    twiml.say({ voice: 'Polly.Joanna' }, 'Perfect. You will receive a confirmation shortly. Goodbye.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  if (step === 6) {
    state.plan_interest = speech || state.plan_interest;
    const payload = {
      intent: state.intent || 'subscribe',
      caller_name: state.caller_name || 'Unknown',
      callback_number: state.callback_number || '',
      preferred_time: state.preferred_time || '',
      plan_interest: state.plan_interest || '',
      timestamp: new Date().toISOString(),
      priority: true,
      callSid
    };
    aftercall.handleAfterCall(payload, config).catch(e => log('error', '/handle', { message: 'aftercall failed', error: e.message, callSid }));
    twiml.say({ voice: 'Polly.Joanna' }, 'Thanks — we will follow up about your subscription. Goodbye.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  // fallback
  twiml.say({ voice: 'Polly.Joanna' }, 'Thanks for calling. Goodbye.');
  twiml.hangup();
  return res.type('text/xml').send(twiml.toString());
});

// --- clarification path (one retry, then end) ---
app.post('/clarify', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({ voice: 'Polly.Joanna' }, 'Thanks for calling LeadLeader. Goodbye.');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// --- cron: daily summary (triggered by external scheduler) ---
app.get('/cron/daily', async (req, res) => {
  const key = req.query.key;
  const tenantId = req.query.tenant;

  if (!key || !config.CRON_SECRET || key !== config.CRON_SECRET) {
    return res.status(403).json({ ok: false, error: 'invalid or missing key' });
  }

  // load tenants
  let tenants;
  try {
    tenants = JSON.parse(fs.readFileSync(path.join(__dirname, 'tenants.json'), 'utf8'));
  } catch (e) {
    console.error('Could not read tenants.json', e);
    return res.status(500).json({ ok: false, error: 'could not load tenants' });
  }

  const tenant = (tenants.tenants || []).find(t => t.id === tenantId);
  if (!tenant) return res.status(404).json({ ok: false, error: 'tenant not found' });

  // Verify we have required Google Sheets config
  if (!config.GOOGLE_SERVICE_ACCOUNT_JSON || !config.SHEETS_SPREADSHEET_ID) {
    return res.status(500).json({ ok: false, error: 'missing Google Sheets configuration' });
  }

  try {
    const sa = config.GOOGLE_SERVICE_ACCOUNT_JSON;
    const jwt = new google.auth.JWT(sa.client_email, null, sa.private_key, [
      'https://www.googleapis.com/auth/spreadsheets'
    ]);
    await jwt.authorize();
    const sheets = google.sheets({ version: 'v4', auth: jwt });

    // Read Calls sheet (assumes header row)
    const callsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SHEETS_SPREADSHEET_ID,
      range: 'Calls'
    });
    const rows = callsRes.data.values || [];
    if (rows.length <= 1) {
      // no data rows
      const dateStrEmpty = dayjs().tz(tenant.timezone).subtract(1, 'day').format('YYYY-MM-DD');
      return res.json({ ok: true, tenant: tenant.id, date: dateStrEmpty, calls_total: 0, top_intent: null });
    }

    const headers = rows[0].map(h => (h || '').toString().toLowerCase());
    const tenantIdx = headers.indexOf('tenant') >= 0 ? headers.indexOf('tenant') : 0;
    const tsIdx = headers.indexOf('timestamp') >= 0 ? headers.indexOf('timestamp') : 1;
    const intentIdx = headers.indexOf('intent') >= 0 ? headers.indexOf('intent') : 2;

    const yesterdayStart = dayjs().tz(tenant.timezone).subtract(1, 'day').startOf('day');
    const yesterdayEnd = dayjs().tz(tenant.timezone).subtract(1, 'day').endOf('day');

    const dataRows = rows.slice(1);
    const filtered = dataRows.filter(r => {
      try {
        const rTenant = (r[tenantIdx] || '').toString();
        if (rTenant !== tenant.id) return false;
        const ts = r[tsIdx];
        const parsed = dayjs(ts).tz(tenant.timezone);
        if (!parsed.isValid()) return false;
        return parsed.isAfter(yesterdayStart) && parsed.isBefore(yesterdayEnd);
      } catch (e) {
        return false;
      }
    });

    const calls_total = filtered.length;
    const intentCounts = {};
    filtered.forEach(r => {
      const it = (r[intentIdx] || 'unknown').toString();
      intentCounts[it] = (intentCounts[it] || 0) + 1;
    });
    const top_intent = Object.keys(intentCounts).sort((a, b) => intentCounts[b] - intentCounts[a])[0] || null;

    // Append summary row to DailySummary
    const dateStr = yesterdayStart.format('YYYY-MM-DD');
    const appendValues = [[dateStr, tenant.id, String(calls_total), top_intent || 'none', new Date().toISOString()]];
    await sheets.spreadsheets.values.append({
  spreadsheetId: config.SHEETS_SPREADSHEET_ID,
      range: 'DailySummary!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: appendValues }
    });

    // Send email summary if SendGrid is configured
    if (config.SENDGRID_API_KEY && Array.isArray(tenant.recipients) && tenant.recipients.length > 0) {
      sgMail.setApiKey(config.SENDGRID_API_KEY);
      const subject = `Daily summary for ${tenant.name} (${dateStr})`;
      const html = `<p>Calls total: <strong>${calls_total}</strong></p><p>Top intent: <strong>${top_intent || 'none'}</strong></p>`;
      const msg = {
        to: tenant.recipients,
        from: tenant.recipients[0],
        subject,
        text: `Calls total: ${calls_total}\nTop intent: ${top_intent || 'none'}`,
        html
      };
      try {
        await sgMail.send(msg);
      } catch (e) {
        console.error('SendGrid send error', e && e.response ? e.response.body : e);
      }
    }

    return res.json({ ok: true, tenant: tenant.id, date: dateStr, calls_total, top_intent });
  } catch (err) {
    console.error('cron/daily error', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// Port configuration: use centralized config
const PORT = config.PORT;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LeadLeader server running on port ${PORT}`);
});

// (optional for tests)
module.exports = app;
