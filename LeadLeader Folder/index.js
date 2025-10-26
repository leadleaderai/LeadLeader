// index.js
// LeadLeader Demo - Whisper transcription + Amazon Polly TTS
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const sgMail = require('@sendgrid/mail');

// Local modules
const { config, safe } = require('./config/config.js');
const ffmpeg = require('./utils/ffmpeg.js');
const polly = require('./utils/polly.js');
const sheets = require('./utils/sheets.js');

dayjs.extend(utc);
dayjs.extend(timezone);

// Initialize SendGrid if configured
if (config.SENDGRID_API_KEY) {
  sgMail.setApiKey(config.SENDGRID_API_KEY);
}

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure temp directories exist
const RECORDINGS_DIR = '/tmp/recordings';
const AUDIO_DIR = '/tmp/audio';
[RECORDINGS_DIR, AUDIO_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Serve generated audio files
app.use('/audio', express.static(AUDIO_DIR));

// Simple logger
function log(level, route, data = {}) {
  const entry = {
    level,
    route,
    timestamp: new Date().toISOString(),
    ...data
  };
  console.log(JSON.stringify(entry));
}

// ============================================================================
// ROUTES
// ============================================================================

// Root health check
app.get('/', (req, res) => {
  res.type('text/plain').send('LeadLeader OK');
});

// Detailed health check
app.get('/_health', (req, res) => {
  const uptime = process.uptime();
  res.json({
    ok: true,
    uptime,
    env: safe()
  });
});

// Demo page - browser UI for recording and uploading
app.get('/demo', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LeadLeader Demo - Voice Transcription</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      margin-top: 0;
    }
    button {
      background: #007bff;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      margin: 5px;
    }
    button:hover {
      background: #0056b3;
    }
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .recording {
      background: #dc3545 !important;
    }
    .status {
      margin: 20px 0;
      padding: 10px;
      border-radius: 4px;
      background: #e9ecef;
    }
    .result {
      margin: 20px 0;
      padding: 15px;
      background: #d4edda;
      border-left: 4px solid #28a745;
      border-radius: 4px;
    }
    .transcript {
      background: #fff;
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
      border: 1px solid #ddd;
      font-family: 'Courier New', monospace;
    }
    audio {
      width: 100%;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎙️ LeadLeader Demo</h1>
    <p>Record a voice message, and we'll transcribe it using Whisper and generate a response with Amazon Polly.</p>
    
    <div>
      <button id="startBtn">Start Recording</button>
      <button id="stopBtn" disabled>Stop Recording</button>
      <button id="uploadBtn" disabled>Upload & Transcribe</button>
    </div>
    
    <div id="status" class="status">Ready to record</div>
    <div id="result"></div>
  </div>

  <script>
    let mediaRecorder;
    let audioChunks = [];
    let audioBlob;

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const status = document.getElementById('status');
    const result = document.getElementById('result');

    startBtn.addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
          audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          status.textContent = 'Recording complete. Click Upload to transcribe.';
          uploadBtn.disabled = false;
        };

        mediaRecorder.start();
        startBtn.disabled = true;
        startBtn.classList.add('recording');
        stopBtn.disabled = false;
        status.textContent = '🔴 Recording... Click Stop when done.';
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
      }
    });

    stopBtn.addEventListener('click', () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        startBtn.disabled = false;
        startBtn.classList.remove('recording');
        stopBtn.disabled = true;
      }
    });

    uploadBtn.addEventListener('click', async () => {
      if (!audioBlob) {
        status.textContent = 'No recording available';
        return;
      }

      uploadBtn.disabled = true;
      status.textContent = '⏳ Uploading and transcribing...';
      result.innerHTML = '';

      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        const response = await fetch('/upload', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

        if (data.ok) {
          let html = '<div class="result">';
          html += '<h3>✅ Success!</h3>';
          html += '<div class="transcript"><strong>Transcript:</strong><br>' + (data.transcript || 'No speech detected') + '</div>';
          
          if (data.ttsUrl) {
            html += '<audio controls src="' + data.ttsUrl + '"></audio>';
          }
          
          html += '</div>';
          result.innerHTML = html;
          status.textContent = 'Done! Record another or refresh the page.';
        } else {
          result.innerHTML = '<div class="result" style="background:#f8d7da;border-color:#dc3545;"><strong>Error:</strong> ' + (data.error || 'Unknown error') + '</div>';
          status.textContent = 'Upload failed. Try again.';
        }
      } catch (err) {
        result.innerHTML = '<div class="result" style="background:#f8d7da;border-color:#dc3545;"><strong>Error:</strong> ' + err.message + '</div>';
        status.textContent = 'Upload failed. Try again.';
      }

      uploadBtn.disabled = false;
      startBtn.disabled = false;
    });
  </script>
</body>
</html>
  `;
  
  res.type('text/html').send(html);
});

// Upload and transcribe audio
const upload = multer({ 
  dest: RECORDINGS_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.post('/upload', upload.single('audio'), async (req, res) => {
  const traceId = uuidv4();
  
  try {
    log('info', '/upload', { traceId, msg: 'Upload started' });

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No audio file uploaded' });
    }

    const originalFile = req.file.filename;
    const webmPath = req.file.path;
    const uuid = uuidv4();
    const wavPath = path.join(RECORDINGS_DIR, `${uuid}.wav`);

    // Convert webm to wav for Whisper
    log('info', '/upload', { traceId, msg: 'Converting to WAV' });
    await ffmpeg.convertToWav(webmPath, wavPath);

    // Get duration
    let durationSec = 0;
    try {
      durationSec = await ffmpeg.getAudioDuration(wavPath);
    } catch (e) {
      log('warn', '/upload', { traceId, msg: 'Could not get duration', error: e.message });
    }

    // Transcribe with Whisper
    let transcript = '';
    let whisperResult = null;
    
    if (config.ENABLE_TRANSCRIBE) {
      log('info', '/upload', { traceId, msg: 'Transcribing with Whisper' });
      
      try {
        const scriptPath = path.join(__dirname, 'scripts', 'transcribe.py');
        const pythonProcess = spawn('python3', [scriptPath, '--audio', wavPath, '--model', 'base.en']);
        
        let stdout = '';
        let stderr = '';
        
        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        await new Promise((resolve, reject) => {
          pythonProcess.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`Transcription failed with code ${code}: ${stderr}`));
            } else {
              resolve();
            }
          });
        });
        
        whisperResult = JSON.parse(stdout);
        transcript = whisperResult.text || '';
        
        log('info', '/upload', { traceId, msg: 'Transcription complete', length: transcript.length });
      } catch (e) {
        log('error', '/upload', { traceId, msg: 'Transcription error', error: e.message });
        transcript = '[Transcription failed]';
      }
    } else {
      transcript = '[Transcription disabled]';
    }

    // Generate Polly TTS response
    let ttsUrl = null;
    
    if (config.ENABLE_POLLY) {
      try {
        const ttsText = "Thanks, we received your message.";
        const ttsPath = path.join(AUDIO_DIR, `${uuid}.mp3`);
        
        await polly.synthesizeToFile(ttsText, ttsPath, config);
        ttsUrl = `${config.PUBLIC_BASE_URL || ''}/audio/${uuid}.mp3`;
        
        log('info', '/upload', { traceId, msg: 'TTS generated', url: ttsUrl });
      } catch (e) {
        log('error', '/upload', { traceId, msg: 'TTS error', error: e.message });
      }
    }

    // Append to Google Sheets
    if (config.SHEETS_SPREADSHEET_ID && config.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        const timestamp = dayjs().tz(config.TENANT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
        const storedPaths = `${wavPath}, ${ttsUrl || 'N/A'}`;
        
        await sheets.appendCallRecord({
          timestamp,
          tenantId: config.TENANT_ID,
          source: 'demo',
          durationSec,
          origFile: originalFile,
          storedPaths,
          transcript
        }, config);
        
        log('info', '/upload', { traceId, msg: 'Appended to Sheets' });
      } catch (e) {
        log('error', '/upload', { traceId, msg: 'Sheets error', error: e.message });
      }
    }

    // Send email via SendGrid
    if (config.SENDGRID_API_KEY && config.SENDGRID_FROM && config.RECIPIENTS.length > 0) {
      try {
        const timestamp = dayjs().tz(config.TENANT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
        
        const emailData = {
          to: config.RECIPIENTS,
          from: config.SENDGRID_FROM,
          subject: `LeadLeader Demo - New Transcription (${timestamp})`,
          text: `New voice recording transcribed:\n\nTranscript:\n${transcript}\n\nDuration: ${durationSec}s\nAudio: ${ttsUrl || 'N/A'}\n\nTimestamp: ${timestamp}`,
          html: `
            <h2>New Voice Recording</h2>
            <p><strong>Timestamp:</strong> ${timestamp}</p>
            <p><strong>Duration:</strong> ${durationSec}s</p>
            <h3>Transcript:</h3>
            <div style="background:#f5f5f5;padding:15px;border-radius:4px;font-family:monospace;">
              ${transcript}
            </div>
            ${ttsUrl ? `<p><a href="${ttsUrl}">Listen to Response</a></p>` : ''}
          `
        };
        
        await sgMail.send(emailData);
        log('info', '/upload', { traceId, msg: 'Email sent' });
      } catch (e) {
        log('error', '/upload', { traceId, msg: 'Email error', error: e.message });
      }
    }

    // Return response
    res.json({
      ok: true,
      transcript,
      ttsUrl,
      durationSec,
      traceId
    });

  } catch (error) {
    log('error', '/upload', { traceId, msg: 'Upload failed', error: error.message });
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Cron endpoint (placeholder)
app.get('/cron/daily', (req, res) => {
  const secret = req.query.secret || req.headers['x-cron-secret'];
  
  if (config.CRON_SECRET && secret !== config.CRON_SECRET) {
    return res.status(403).json({ ok: false, error: 'Invalid cron secret' });
  }

  log('info', '/cron/daily', { msg: 'Cron triggered (no-op)' });
  
  res.json({ 
    ok: true, 
    message: 'Cron executed (no-op)',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

// Start server
const PORT = config.PORT;
app.listen(PORT, () => {
  log('info', 'server', { msg: `Server started on port ${PORT}`, env: config.NODE_ENV });
});
