require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const { getResponse } = require('./router');
const { google } = require('googleapis');
const sgMail = require('@sendgrid/mail');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fs = require('fs');
const path = require('path');

dayjs.extend(utc);
dayjs.extend(timezone);

// optional: if you want SSML later, we can wrap lines with this
// const { addNaturalPacing } = require('./utils/ssml');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic CORS headers (lightweight, avoids extra dependency)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// serve audio files
app.use('/audio', express.static(path.join(__dirname, 'audio')));

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

// --- initial inbound call ---
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/handle',
    method: 'POST'
  });

  // greeting — play hosted greeting audio
  // (audio files are served from /audio)
  gather.play('/audio/greeting.mp3');

  // if no input captured
  sayLine(twiml, "Sorry, I didn’t catch that. Please call back.");

  res.type('text/xml').send(twiml.toString());
});

// --- main step handler ---
app.post('/handle', (req, res) => {
  const speechResult = req.body.SpeechResult || '';
  console.log('SpeechResult:', speechResult);

  const { text, intent } = normalizeResult(getResponse(speechResult));
  const twiml = new twilio.twiml.VoiceResponse();

  if (intent === 'unknown') {
    // clarify once
    const gather = twiml.gather({
      input: 'speech',
      speechTimeout: 'auto',
      action: '/clarify',
      method: 'POST'
    });
    sayLine(gather, text);
    return res.type('text/xml').send(twiml.toString());
  }

  if (intent === 'finalize') {
    sayLine(twiml, text);
    sayLine(twiml, "Thanks for calling LeadLeader. Goodbye.");
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  // normal branch → respond and keep listening once more
  const gather = twiml.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/handle',
    method: 'POST'
  });
  sayLine(gather, text);

  return res.type('text/xml').send(twiml.toString());
});

// --- clarification path (one retry, then end) ---
app.post('/clarify', (req, res) => {
  const speechResult = req.body.SpeechResult || '';
  console.log('Clarify SpeechResult:', speechResult);

  const { text, intent } = normalizeResult(getResponse(speechResult));
  const twiml = new twilio.twiml.VoiceResponse();

  if (intent === 'unknown') {
    sayLine(twiml, "Thanks for calling LeadLeader. Goodbye.");
    twiml.hangup();
  } else if (intent === 'finalize') {
    sayLine(twiml, text);
    sayLine(twiml, "Thanks for calling LeadLeader. Goodbye.");
    twiml.hangup();
  } else {
    // clarified to a known branch → answer and end (no loops)
    sayLine(twiml, text);
    sayLine(twiml, "Thanks for calling LeadLeader. Goodbye.");
    twiml.hangup();
  }

  res.type('text/xml').send(twiml.toString());
});

// --- cron: daily summary (triggered by external scheduler) ---
app.get('/cron/daily', async (req, res) => {
  const key = req.query.key;
  const tenantId = req.query.tenant;

  if (!key || !process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
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
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.SHEETS_SPREADSHEET_ID) {
    return res.status(500).json({ ok: false, error: 'missing Google Sheets configuration' });
  }

  try {
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const jwt = new google.auth.JWT(sa.client_email, null, sa.private_key, [
      'https://www.googleapis.com/auth/spreadsheets'
    ]);
    await jwt.authorize();
    const sheets = google.sheets({ version: 'v4', auth: jwt });

    // Read Calls sheet (assumes header row)
    const callsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEETS_SPREADSHEET_ID,
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
      spreadsheetId: process.env.SHEETS_SPREADSHEET_ID,
      range: 'DailySummary!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: appendValues }
    });

    // Send email summary if SendGrid is configured
    if (process.env.SENDGRID_API_KEY && Array.isArray(tenant.recipients) && tenant.recipients.length > 0) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LeadLeader server running on port ${PORT}`);
});

// (optional for tests)
module.exports = app;
