// ═══════════════════════════════════════════════════════════
// WHISPER.JS - Wrapper for Python-based Whisper transcription
// ═══════════════════════════════════════════════════════════
// Uses faster-whisper via scripts/transcribe.py
// Returns structured JSON with text, segments, duration, language

const { spawn } = require('child_process');
const path = require('path');

/**
 * Transcribe audio file using Whisper (faster-whisper Python implementation)
 * 
 * @param {string} audioPath - Absolute path to audio file (WAV format recommended)
 * @param {string} modelName - Whisper model size (default: 'base.en')
 * @returns {Promise<object>} Transcription result with text, segments, duration, language
 */
async function transcribeAudio(audioPath, modelName = 'base.en') {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../scripts/transcribe.py');
    
    const pythonProcess = spawn('python3', [
      scriptPath,
      '--audio', audioPath,
      '--model', modelName
    ]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Transcription failed (exit ${code}): ${stderr}`));
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (err) {
        reject(new Error(`Failed to parse transcription output: ${err.message}`));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}

/**
 * Get plain text from transcription (convenience method)
 * 
 * @param {string} audioPath - Absolute path to audio file
 * @param {string} modelName - Whisper model size
 * @returns {Promise<string>} Transcribed text only
 */
async function transcribeText(audioPath, modelName = 'base.en') {
  const result = await transcribeAudio(audioPath, modelName);
  return result.text || '';
}

module.exports = {
  transcribeAudio,
  transcribeText
};
