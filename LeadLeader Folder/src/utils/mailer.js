// ═══════════════════════════════════════════════════════════
// MAILER.JS - SendGrid email wrapper
// ═══════════════════════════════════════════════════════════
// Simplified interface for sending transactional emails

const sgMail = require('@sendgrid/mail');
const config = require('./config');

// Initialize SendGrid (lazy)
let initialized = false;

function ensureInitialized() {
  if (!initialized && config.SENDGRID_API_KEY) {
    sgMail.setApiKey(config.SENDGRID_API_KEY);
    initialized = true;
  }
}

/**
 * Send a simple text email via SendGrid
 * 
 * @param {object} options - Email options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} [options.html] - HTML body (optional)
 * @param {string} [options.from] - Sender email (defaults to config.SENDGRID_FROM)
 * @returns {Promise<void>}
 */
async function sendEmail({ to, subject, text, html, from }) {
  ensureInitialized();

  if (!config.SENDGRID_API_KEY) {
    console.warn('[mailer] SendGrid API key not configured, skipping email');
    return;
  }

  const msg = {
    to,
    from: from || config.SENDGRID_FROM,
    subject,
    text,
    ...(html && { html })
  };

  try {
    await sgMail.send(msg);
    console.log(`[mailer] Email sent to ${Array.isArray(to) ? to.join(', ') : to}`);
  } catch (error) {
    console.error('[mailer] Failed to send email:', error.message);
    if (error.response) {
      console.error('[mailer] SendGrid error:', error.response.body);
    }
    throw error;
  }
}

/**
 * Send transcription notification email
 * 
 * @param {object} data - Transcription data
 * @param {string} data.transcript - Transcribed text
 * @param {number} data.duration - Audio duration in seconds
 * @param {string} data.tenant - Tenant ID
 * @param {string[]} recipients - Email addresses
 * @returns {Promise<void>}
 */
async function sendTranscriptionEmail({ transcript, duration, tenant }, recipients) {
  const subject = `[LeadLeader] New Transcription - ${tenant}`;
  const text = `
New voice transcription received:

Tenant: ${tenant}
Duration: ${duration.toFixed(1)}s

Transcript:
${transcript}

---
LeadLeader Platform
  `.trim();

  const html = `
<div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #007bff;">New Voice Transcription</h2>
  <p><strong>Tenant:</strong> ${tenant}</p>
  <p><strong>Duration:</strong> ${duration.toFixed(1)}s</p>
  <hr style="border: 1px solid #e5e5e5; margin: 20px 0;">
  <h3>Transcript:</h3>
  <p style="background: #f5f5f5; padding: 15px; border-radius: 5px; white-space: pre-wrap;">${transcript}</p>
  <hr style="border: 1px solid #e5e5e5; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">LeadLeader Platform</p>
</div>
  `.trim();

  await sendEmail({
    to: recipients,
    subject,
    text,
    html
  });
}

/**
 * Send contact form submission email
 * 
 * @param {object} data - Contact form data
 * @param {string} data.name - Sender name
 * @param {string} data.email - Sender email
 * @param {string} data.message - Message content
 * @param {string[]} recipients - Admin email addresses
 * @returns {Promise<void>}
 */
async function sendContactFormEmail({ name, email, message }, recipients) {
  const subject = `[LeadLeader] Contact Form - ${name}`;
  const text = `
New contact form submission:

Name: ${name}
Email: ${email}

Message:
${message}

---
Reply to: ${email}
  `.trim();

  const html = `
<div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #007bff;">New Contact Form Submission</h2>
  <p><strong>Name:</strong> ${name}</p>
  <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
  <hr style="border: 1px solid #e5e5e5; margin: 20px 0;">
  <h3>Message:</h3>
  <p style="background: #f5f5f5; padding: 15px; border-radius: 5px; white-space: pre-wrap;">${message}</p>
  <hr style="border: 1px solid #e5e5e5; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">LeadLeader Platform</p>
</div>
  `.trim();

  await sendEmail({
    to: recipients,
    subject,
    text,
    html
  });
}

module.exports = {
  sendEmail,
  sendTranscriptionEmail,
  sendContactFormEmail
};
