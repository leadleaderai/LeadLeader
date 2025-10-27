// ═══════════════════════════════════════════════════════════
// EMAIL TEMPLATE UTILITY - Simple {{var}} substitution
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'emails');

/**
 * Render template by replacing {{var}} placeholders with data values
 * @param {string} templateName - Name of template file (without extension)
 * @param {string} format - 'html' or 'txt'
 * @param {object} data - Key-value pairs for substitution
 * @returns {string} Rendered template content
 */
function render(templateName, format, data) {
  const ext = format === 'html' ? 'html' : 'txt';
  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.${ext}`);
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  
  let content = fs.readFileSync(templatePath, 'utf8');
  
  // Replace {{var}} with data[var], escape HTML entities in text values for HTML templates
  Object.keys(data).forEach(key => {
    const value = String(data[key] || '');
    const escapedValue = format === 'html' ? escapeHtml(value) : value;
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    content = content.replace(regex, escapedValue);
  });
  
  return content;
}

/**
 * Render template with file path directly
 * @param {string} filePath - Full path to template file
 * @param {object} vars - Variables to substitute
 * @returns {string} Rendered content
 */
function renderTemplate(filePath, vars) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${filePath}`);
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  Object.keys(vars).forEach(key => {
    const value = String(vars[key] || '');
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    content = content.replace(regex, value);
  });
  
  return content;
}

/**
 * Basic HTML entity escaping (for pre tags, keep newlines)
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { render, renderTemplate };
