// ═══════════════════════════════════════════════════════════
// HELPERS.JS - Utility functions for views and routes
// ═══════════════════════════════════════════════════════════

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Format timestamp for display
 * 
 * @param {Date|string} date - Date to format
 * @param {string} [tz] - Timezone (defaults to 'America/Los_Angeles')
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(date, tz = 'America/Los_Angeles') {
  return dayjs(date).tz(tz).format('YYYY-MM-DD HH:mm:ss z');
}

/**
 * Format duration in seconds to human-readable string
 * 
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1m 23s" or "45s")
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

/**
 * Sanitize HTML to prevent XSS
 * 
 * @param {string} text - Text to sanitize
 * @returns {string} HTML-safe text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Generate navigation menu items
 * 
 * @param {string} currentPath - Current route path
 * @returns {Array<{href: string, label: string, active: boolean}>}
 */
function getNavItems(currentPath) {
  const items = [
    { href: '/', label: 'Home' },
    { href: '/try', label: 'Try' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/contact', label: 'Contact' }
  ];

  return items.map(item => ({
    ...item,
    active: currentPath === item.href || 
            (item.href !== '/' && currentPath.startsWith(item.href))
  }));
}

/**
 * Create page metadata object for EJS templates
 * 
 * @param {object} options - Page options
 * @param {string} options.title - Page title
 * @param {string} [options.description] - Meta description
 * @param {string} options.path - Current route path
 * @returns {object} Page metadata
 */
function createPageData({ title, description, path }) {
  return {
    title: `${title} - LeadLeader`,
    description: description || 'AI-powered call assistant & automation platform',
    path,
    navItems: getNavItems(path),
    year: new Date().getFullYear(),
    version: 'v0.1 (beta)'
  };
}

/**
 * Generate trace ID for logging
 * 
 * @returns {string} Unique trace ID
 */
function generateTraceId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Truncate text to specified length
 * 
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text with ellipsis if needed
 */
function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substr(0, maxLength - 3) + '...';
}

/**
 * Parse boolean environment variable
 * 
 * @param {string|boolean} value - Value to parse
 * @param {boolean} defaultValue - Default if undefined
 * @returns {boolean}
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  return value.toLowerCase() === 'true' || value === '1';
}

module.exports = {
  formatTimestamp,
  formatDuration,
  escapeHtml,
  getNavItems,
  createPageData,
  generateTraceId,
  truncate,
  parseBoolean
};
