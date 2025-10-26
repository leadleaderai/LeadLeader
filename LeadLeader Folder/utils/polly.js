// utils/polly.js
// Amazon Polly TTS synthesis
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const fs = require('fs');
const path = require('path');

let pollyClient = null;

/**
 * Initialize Polly client (lazy)
 * @param {object} config - AWS configuration
 * @returns {PollyClient}
 */
function getPollyClient(config) {
  if (!pollyClient) {
    if (!config.AWS_REGION || !config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured for Polly');
    }

    pollyClient = new PollyClient({
      region: config.AWS_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY
      }
    });
  }
  
  return pollyClient;
}

/**
 * Synthesize text to MP3 file using Amazon Polly Neural
 * @param {string} text - Text to synthesize
 * @param {string} outPath - Output MP3 file path
 * @param {object} config - AWS configuration
 * @param {string} voiceId - Polly voice ID (default: Joanna)
 * @returns {Promise<string>} - Output file path
 */
async function synthesizeToFile(text, outPath, config, voiceId = 'Joanna') {
  try {
    const client = getPollyClient(config);
    
    // Ensure output directory exists
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: voiceId,
      Engine: 'neural',  // Use neural engine for better quality
      TextType: 'text'
    });

    const response = await client.send(command);
    
    if (!response.AudioStream) {
      throw new Error('No audio stream returned from Polly');
    }

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.AudioStream) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    // Write to file
    fs.writeFileSync(outPath, audioBuffer);

    return outPath;
  } catch (error) {
    throw new Error(`Polly synthesis failed: ${error.message}`);
  }
}

/**
 * Synthesize text to buffer (no file write)
 * @param {string} text - Text to synthesize
 * @param {object} config - AWS configuration
 * @param {string} voiceId - Polly voice ID
 * @returns {Promise<Buffer>} - Audio buffer
 */
async function synthesizeToBuffer(text, config, voiceId = 'Joanna') {
  try {
    const client = getPollyClient(config);

    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: voiceId,
      Engine: 'neural',
      TextType: 'text'
    });

    const response = await client.send(command);
    
    if (!response.AudioStream) {
      throw new Error('No audio stream returned from Polly');
    }

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.AudioStream) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    throw new Error(`Polly synthesis failed: ${error.message}`);
  }
}

module.exports = {
  synthesizeToFile,
  synthesizeToBuffer
};
