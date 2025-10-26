// utils/ffmpeg.js
// Promisified ffmpeg helpers for audio conversion
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Convert audio file to WAV (16kHz mono) for Whisper
 * @param {string} inputPath - Input audio file path
 * @param {string} outputPath - Output WAV file path
 * @returns {Promise<string>} - Output path on success
 */
function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    // Ensure output directory exists
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const args = [
      '-i', inputPath,
      '-ar', '16000',        // 16kHz sample rate
      '-ac', '1',            // Mono
      '-c:a', 'pcm_s16le',   // PCM 16-bit
      '-y',                  // Overwrite output
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args);
    
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
      
      if (!fs.existsSync(outputPath)) {
        return reject(new Error(`ffmpeg succeeded but output not found: ${outputPath}`));
      }

      resolve(outputPath);
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg spawn error: ${err.message}`));
    });
  });
}

/**
 * Convert audio file to MP3
 * @param {string} inputPath - Input audio file path
 * @param {string} outputPath - Output MP3 file path
 * @param {number} bitrate - Audio bitrate in kbps (default: 128)
 * @returns {Promise<string>} - Output path on success
 */
function convertToMp3(inputPath, outputPath, bitrate = 128) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    // Ensure output directory exists
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const args = [
      '-i', inputPath,
      '-codec:a', 'libmp3lame',
      '-b:a', `${bitrate}k`,
      '-y',
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args);
    
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
      
      if (!fs.existsSync(outputPath)) {
        return reject(new Error(`ffmpeg succeeded but output not found: ${outputPath}`));
      }

      resolve(outputPath);
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg spawn error: ${err.message}`));
    });
  });
}

/**
 * Get audio duration in seconds
 * @param {string} audioPath - Audio file path
 * @returns {Promise<number>} - Duration in seconds
 */
function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(audioPath)) {
      return reject(new Error(`Audio file not found: ${audioPath}`));
    }

    const args = [
      '-i', audioPath,
      '-hide_banner',
      '-f', 'null',
      '-'
    ];

    const ffmpeg = spawn('ffmpeg', args);
    
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', () => {
      // Parse duration from stderr (format: Duration: 00:00:12.34)
      const match = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseFloat(match[3]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        resolve(Math.round(totalSeconds * 100) / 100);
      } else {
        reject(new Error('Could not parse audio duration'));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg spawn error: ${err.message}`));
    });
  });
}

module.exports = {
  convertToWav,
  convertToMp3,
  getAudioDuration
};
