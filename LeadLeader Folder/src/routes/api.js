// ═══════════════════════════════════════════════════════════
// ROUTE: /api.js - API endpoints for upload and contact
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const config = require('../utils/config');
const abuse = require('../utils/abuse');
const { log } = require('../utils/logger');
const { convertToWav, getAudioDuration } = require('../utils/ffmpeg');
const { transcribeAudio } = require('../utils/whisper');
const { synthesizeToFile } = require('../utils/polly');
const { appendCallRecord } = require('../utils/sheets');
const { sendTranscriptionEmail, sendContactFormEmail } = require('../utils/mailer');
const { generateTraceId, formatTimestamp } = require('../utils/helpers');
const { appendEvent } = require('../utils/store/eventsStore');
const { getPrefs } = require('../utils/store/prefsStore');
const { recordHit } = require('../utils/store/quotasStore');
const { getPlan } = require('../utils/usersStore');

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/recordings/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg'];
    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

// Ensure temp directories exist
async function ensureTempDirs() {
  await fs.mkdir('/tmp/recordings', { recursive: true });
  await fs.mkdir('/tmp/audio', { recursive: true });
}

ensureTempDirs().catch(console.error);

// ───────────────────────────────────────────────
// ROUTE: POST /upload - Voice upload & transcription pipeline
// PIPELINE: Upload → Convert → Transcribe → TTS → Log → Email
// ───────────────────────────────────────────────
router.post('/upload', upload.single('audio'), async (req, res) => {
  const traceId = generateTraceId();
  const startTime = Date.now();

  abuse.incCounter('uploads');

  console.log(JSON.stringify({
    level: 'info',
    route: '/upload',
    traceId,
    event: 'upload_started',
    file: req.file?.originalname
  }));

  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No audio file provided' });
  }

  const uploadPath = req.file.path;
  const wavPath = path.join('/tmp/recordings', `${traceId}.wav`);
  const mp3Path = path.join('/tmp/audio', `${traceId}.mp3`);

  try {
    // Step 1: Convert to WAV for Whisper
    console.log(JSON.stringify({ level: 'info', route: '/upload', traceId, event: 'converting_to_wav' }));
    await convertToWav(uploadPath, wavPath);

    // Get audio duration
    const duration = await getAudioDuration(wavPath);

    // Step 2: Transcribe with Whisper (if enabled)
    let transcript = '[Transcription disabled]';
    if (config.ENABLE_TRANSCRIBE) {
      console.log(JSON.stringify({ level: 'info', route: '/upload', traceId, event: 'transcribing' }));
      try {
        const result = await transcribeAudio(wavPath, 'base.en');
        transcript = result.text || '';
      } catch (err) {
        console.error(JSON.stringify({ level: 'error', route: '/upload', traceId, event: 'transcribe_failed', error: err.message }));
        transcript = `[Transcription failed: ${err.message}]`;
      }
    }

    // Step 3: Generate TTS response with Polly (if enabled)
    let pollyAudioPath = null;
    let pollyText = null;
    if (config.ENABLE_POLLY && transcript && !transcript.startsWith('[')) {
      console.log(JSON.stringify({ level: 'info', route: '/upload', traceId, event: 'generating_tts' }));
      try {
        pollyText = `Thank you for your message. I heard: ${transcript.substring(0, 100)}`;
        await synthesizeToFile(pollyText, mp3Path, config);
        pollyAudioPath = `/audio/${traceId}.mp3`;
      } catch (err) {
        console.error(JSON.stringify({ level: 'error', route: '/upload', traceId, event: 'polly_failed', error: err.message }));
      }
    }

    // Step 4: Log to Google Sheets (non-blocking)
    if (config.SHEETS_SPREADSHEET_ID && config.GOOGLE_SERVICE_ACCOUNT_JSON) {
      appendCallRecord({
        timestamp: formatTimestamp(new Date(), config.TENANT_TIMEZONE),
        tenant: config.TENANT_ID,
        source: 'demo',
        durationSec: duration || 0,
        origFile: req.file.originalname,
        storedPaths: JSON.stringify({ wav: wavPath, mp3: mp3Path }),
        transcript
      }, config).then(() => {
        abuse.incCounter('sheetsOk');
      }).catch(err => {
        abuse.incCounter('sheetsErr');
        abuse.recordError(`sheets_failed:${err.message}`);
        console.error(JSON.stringify({ level: 'error', route: '/upload', traceId, event: 'sheets_failed', error: err.message }));
      });
    }

    // Step 5: Send email notification (non-blocking)
    if (config.RECIPIENTS && config.SENDGRID_API_KEY) {
      sendTranscriptionEmail({
        transcript,
        duration: duration || 0,
        tenant: config.TENANT_ID
      }, config.RECIPIENTS).then(() => {
        abuse.incCounter('emailsSentOk');
      }).catch(err => {
        abuse.incCounter('emailsSentErr');
        abuse.recordError(`email_failed:${err.message}`);
        console.error(JSON.stringify({ level: 'error', route: '/upload', traceId, event: 'email_failed', error: err.message }));
      });
    }

    // Cleanup uploaded file
    await fs.unlink(uploadPath).catch(() => {});

    const elapsed = Date.now() - startTime;
    console.log(JSON.stringify({ level: 'info', route: '/upload', traceId, event: 'upload_complete', elapsed_ms: elapsed }));

    // Return response
    res.json({
      ok: true,
      traceId,
      transcript,
      duration,
      pollyAudioPath,
      pollyText,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', route: '/upload', traceId, event: 'pipeline_error', error: err.message, stack: err.stack }));
    
    // Cleanup on error
    await fs.unlink(uploadPath).catch(() => {});
    await fs.unlink(wavPath).catch(() => {});

    res.status(500).json({
      ok: false,
      error: 'Upload processing failed',
      details: err.message
    });
  }
});

// ───────────────────────────────────────────────
// ROUTE: POST /api/contact - Contact form submission
// ACTION: Send email via SendGrid with template system
// NOW ROADMAP: Enforce quotas, check prefs, append events
// ───────────────────────────────────────────────
router.post('/api/contact', abuse.limitContact, express.json(), async (req, res) => {
  const traceId = generateTraceId();
  const { name, email, message, website, 'h-captcha-response': hcaptchaToken } = req.body;

  const userAgent = req.get('user-agent') || 'unknown';
  const clientIp = req.ip;

  // Check if user is authenticated for quota enforcement
  const userId = req.session?.user?.id;
  const username = req.session?.user?.username;

  // Honeypot check (immediate rejection, appear as bot)
  if (website && String(website).trim() !== '') {
    abuse.recordError('contact_honeypot_triggered');
    log('contact', { ok: false, reason: 'honeypot', ip: clientIp, ua: userAgent });
    return res.status(400).json({
      ok: false,
      error: 'Bot detected'
    });
  }

  // hCaptcha verification (if configured and token present)
  if (config.HCAPTCHA_SECRET && hcaptchaToken) {
    const ip = clientIp || req.connection.remoteAddress;
    const verified = await abuse.verifyHCaptcha(hcaptchaToken, ip);
    if (!verified) {
      abuse.recordError('contact_hcaptcha_failed');
      log('contact', { ok: false, reason: 'captcha_failed', ip: clientIp, ua: userAgent });
      return res.status(400).json({
        ok: false,
        error: 'Captcha failed'
      });
    }
  }

  // Quota enforcement (NOW roadmap: Plans and Quotas)
  if (userId && username) {
    try {
      const plan = await getPlan(username) || 'free';
      const quota = await recordHit({ userId, kind: 'contact_daily', plan });
      if (!quota.allowed) {
        log('contact', { ok: false, reason: 'quota_exceeded', userId, plan, retryAfter: quota.retryAfter });
        return res.status(429).json({
          ok: false,
          error: 'Daily contact limit reached',
          retryAfter: quota.retryAfter
        });
      }
    } catch (err) {
      console.error('[contact] Quota check failed:', err);
      // Continue without blocking if quota system fails
    }
  }

  // Validate and sanitize input
  const cleanName = String(name || '').trim().substring(0, 100).replace(/[\x00-\x1F\x7F]/g, '');
  const cleanEmail = String(email || '').trim().substring(0, 120).replace(/[\x00-\x1F\x7F]/g, '');
  const cleanMessage = String(message || '').trim().substring(0, 5000).replace(/[\x00-\x1F\x7F]/g, '');

  if (!cleanName || !cleanEmail || !cleanMessage) {
    return res.status(400).json({
      ok: false,
      error: 'Missing required fields: name, email, message'
    });
  }

  if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid email address'
    });
  }

  // Check notification preferences (NOW roadmap: Notification Preferences)
  let sendEmail = true;
  if (userId) {
    try {
      const prefs = await getPrefs(userId);
      sendEmail = prefs.emailEnabled;
    } catch (err) {
      console.error('[contact] Prefs check failed:', err);
      // Continue with default behavior
    }
  }

  try {
    // Send email using mailer utility (if enabled by prefs)
    let emailResult = { ok: true };
    if (sendEmail) {
      emailResult = await sendContactFormEmail(
        { name: cleanName, email: cleanEmail, message: cleanMessage },
        (config.RECIPIENTS || []).filter(Boolean)
      );

      if (!emailResult || emailResult.ok === false) {
        log('contact', { ok: false, error: emailResult?.error || 'unknown', from: cleanEmail, ip: clientIp, ua: userAgent });
        // Don't return error yet, still append event
      } else {
        abuse.incCounter('emailsSentOk');
      }
    }

    // Append event to feed (NOW roadmap: In-App Results Feed)
    if (userId) {
      try {
        await appendEvent({
          userId,
          type: 'contact_submitted',
          payload: {
            name: cleanName,
            email: cleanEmail,
            messagePreview: cleanMessage.substring(0, 100),
            emailSent: sendEmail && emailResult.ok
          },
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('[contact] Event append failed:', err);
        // Continue without blocking
      }
    }

    log('contact', { ok: true, from: cleanEmail, ip: clientIp, ua: userAgent, emailSent: sendEmail });
    console.log(JSON.stringify({ level: 'info', route: '/api/contact', traceId, event: 'contact_complete', emailSent: sendEmail }));

    res.json({
      ok: true,
      message: 'Contact form submitted successfully'
    });
  } catch (err) {
    abuse.incCounter('emailsSentErr');
    abuse.recordError(`contact_failed:${err.message}`);
    log('contact', { ok: false, error: err.message, from: cleanEmail, ip: clientIp, ua: userAgent });
    console.error(JSON.stringify({ level: 'error', route: '/api/contact', traceId, event: 'contact_failed', error: err.message }));
    
    res.status(500).json({
      ok: false,
      error: 'Failed to send contact form'
    });
  }
});

// ───────────────────────────────────────────────
// ROUTE: POST /api/chat - Text chat demo
// ACTION: Rule-based responses
// ───────────────────────────────────────────────
router.post('/api/chat', abuse.limitChat, express.json(), async (req, res) => {
  const { message } = req.body;

  if (!config.ENABLE_TEXT_CHAT) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Invalid message'
    });
  }

  abuse.incCounter('chatTurns');

  const lower = message.toLowerCase().trim();
  let reply = "I'm a simple demo bot. Try asking about 'features', 'pricing', or 'help'.";

  // Simple rule-based responses
  if (lower.includes('feature')) {
    reply = "LeadLeader offers voice transcription, TTS with AWS Polly, automated email notifications, and Google Sheets logging.";
  } else if (lower.includes('pric')) {
    reply = "For pricing information, please contact us via the contact form.";
  } else if (lower.includes('help') || lower.includes('support')) {
    reply = "Need help? Visit our dashboard for documentation or reach out via the contact page.";
  } else if (lower.includes('hello') || lower.includes('hi')) {
    reply = "Hello! I'm the LeadLeader assistant. How can I help you today?";
  } else if (lower.includes('thank')) {
    reply = "You're welcome! Let me know if you have any other questions.";
  }

  res.json({
    ok: true,
    reply,
    timestamp: new Date().toISOString()
  });
});

// ───────────────────────────────────────────────
// ROUTE: GET /audio/:file - Serve generated audio files
// SOURCE: /tmp/audio directory
// ───────────────────────────────────────────────
router.use('/audio', express.static('/tmp/audio'));

module.exports = router;
