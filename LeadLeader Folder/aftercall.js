const { google } = require('googleapis');
const sgMail = require('@sendgrid/mail');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fs = require('fs');
const path = require('path');

dayjs.extend(utc);
dayjs.extend(timezone);

async function handleAfterCall(payload, config) {
  // Run three parallel actions but never throw
  const results = await Promise.allSettled([
    saveToSheets(payload, config),
    sendEmailSummary(payload, config),
    createCalendarEvent(payload, config)
  ]);
  // Log concise summary
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`aftercall: action[${i}] success`);
    } else {
      console.error(`aftercall: action[${i}] failed:`, r.reason && r.reason.message ? r.reason.message : r.reason);
    }
  });
}

async function saveToSheets(payload, config) {
  try {
    if (!config.SHEETS_SPREADSHEET_ID || !config.GOOGLE_SERVICE_ACCOUNT_JSON) {
      console.log('saveToSheets: missing config; skipping');
      return;
    }
    const sa = config.GOOGLE_SERVICE_ACCOUNT_JSON;
    const jwt = new google.auth.JWT(sa.client_email, null, sa.private_key, [
      'https://www.googleapis.com/auth/spreadsheets'
    ]);
    await jwt.authorize();
    const sheets = google.sheets({ version: 'v4', auth: jwt });
    const row = [
      payload.timestamp || new Date().toISOString(),
      payload.intent || '',
      payload.caller_name || '',
      payload.callback_number || '',
      payload.preferred_time || '',
      payload.plan_interest || '',
      payload.priority ? 'true' : 'false',
      config.TENANT_ID || 'demo'
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.SHEETS_SPREADSHEET_ID,
      range: 'Calls!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });
    return true;
  } catch (e) {
    throw e;
  }
}

async function sendEmailSummary(payload, config) {
  try {
    if (!config.SENDGRID_API_KEY || !config.RECIPIENTS || config.RECIPIENTS.length === 0) {
      console.log('sendEmailSummary: missing SendGrid config or recipients; skipping');
      return;
    }
    sgMail.setApiKey(config.SENDGRID_API_KEY);
    const subject = `LeadLeader — ${payload.intent} — ${payload.caller_name || 'Unknown'}`;
    const html = `
      <p><strong>Intent:</strong> ${payload.intent}</p>
      <p><strong>Name:</strong> ${payload.caller_name}</p>
      <p><strong>Phone:</strong> ${payload.callback_number}</p>
      <p><strong>Preferred time:</strong> ${payload.preferred_time}</p>
      <p><strong>Plan interest:</strong> ${payload.plan_interest}</p>
      <p><strong>Priority:</strong> ${payload.priority}</p>
      <pre>${JSON.stringify(payload, null, 2)}</pre>
    `;
    const msg = {
      to: config.RECIPIENTS,
      from: config.SENDGRID_FROM || (config.RECIPIENTS[0] || 'no-reply@example.com'),
      subject,
      html,
      text: `Intent: ${payload.intent} \nName: ${payload.caller_name}`
    };
    await sgMail.send(msg);
    return true;
  } catch (e) {
    throw e;
  }
}

function parsePreferredTime(phrase, tz) {
  // very small heuristic parser
  const p = (phrase || '').toLowerCase();
  const now = dayjs().tz(tz || 'America/Los_Angeles');
  if (!p) return now.add(60, 'minute');
  if (p.includes('tomorrow')) return now.add(1, 'day').hour(9).minute(0).second(0);
  if (p.includes('today')) return now.hour(14).minute(0).second(0);
  if (p.includes('morning')) return now.add(1, 'day').hour(9).minute(0).second(0);
  if (p.includes('afternoon')) return now.add(1, 'day').hour(14).minute(0).second(0);
  if (p.includes('evening')) return now.add(1, 'day').hour(18).minute(0).second(0);
  // default to now+60m
  return now.add(60, 'minute');
}

async function createCalendarEvent(payload, config) {
  try {
    if (!config.GOOGLE_SERVICE_ACCOUNT_JSON) {
      console.log('createCalendarEvent: no google credentials; skipping');
      return;
    }
    const sa = config.GOOGLE_SERVICE_ACCOUNT_JSON;
    const jwt = new google.auth.JWT(sa.client_email, null, sa.private_key, [
      'https://www.googleapis.com/auth/calendar'
    ]);
    await jwt.authorize();
    const calendar = google.calendar({ version: 'v3', auth: jwt });
    const when = parsePreferredTime(payload.preferred_time, config.TENANT_TIMEZONE);
    const start = when.toISOString();
    const end = when.add(30, 'minute').toISOString();
    const event = {
      summary: `Lead call — ${payload.intent}`,
      description: JSON.stringify(payload, null, 2),
      start: { dateTime: start, timeZone: config.TENANT_TIMEZONE },
      end: { dateTime: end, timeZone: config.TENANT_TIMEZONE },
      attendees: (config.RECIPIENTS || []).map(email => ({ email }))
    };
    await calendar.events.insert({ calendarId: 'primary', requestBody: event });
    return true;
  } catch (e) {
    throw e;
  }
}

module.exports = { handleAfterCall };
