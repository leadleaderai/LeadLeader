// ═══════════════════════════════════════════════════════════
// ROUTE: /main.js - Home, docs, contact pages
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { createPageData } = require('../utils/helpers');
const config = require('../utils/config');

// ───────────────────────────────────────────────
// ROUTE: / - Homepage with marketing content
// ───────────────────────────────────────────────
router.get('/', (req, res) => {
  const pageData = createPageData({
    title: 'Home',
    description: 'AI-powered call assistant & automation platform',
    path: '/'
  });
  
  res.render('home', pageData);
});

// ───────────────────────────────────────────────
// ROUTE: /docs - API documentation
// SOURCE: Auto-generated from app routes and config
// ───────────────────────────────────────────────
router.get('/docs', (req, res) => {
  const pageData = createPageData({
    title: 'API Documentation',
    description: 'Complete API reference for LeadLeader Platform',
    path: '/docs'
  });

  // Get safe config for display
  const env = config.safe();

  // Generate route list from Express app
  const routes = [];
  const app = req.app;
  
  // Extract routes from Express router stack
  if (app._router && app._router.stack) {
    app._router.stack.forEach(layer => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods);
        methods.forEach(method => {
          routes.push({
            method: method.toUpperCase(),
            path: layer.route.path,
            description: getRouteDescription(layer.route.path)
          });
        });
      }
    });
  }

  res.render('docs', {
    ...pageData,
    env,
    routes
  });
});

// Helper function to provide descriptions for routes
function getRouteDescription(path) {
  const descriptions = {
    '/': 'Homepage with platform overview',
    '/_health': 'Health check endpoint with system status',
    '/demo': 'Interactive voice recording demo',
    '/dashboard': 'View recent transcriptions and analytics',
    '/docs': 'API documentation and examples',
    '/contact': 'Contact form submission page',
    '/admin': 'Admin portal (coming soon)',
    '/upload': 'Upload audio file for transcription',
    '/api/contact': 'Submit contact form via email',
    '/cron/daily': 'Daily cron job endpoint (requires secret)',
    '/audio/:file': 'Serve generated audio files'
  };
  return descriptions[path] || '';
}

// ───────────────────────────────────────────────
// ROUTE: /contact - Contact form page
// ───────────────────────────────────────────────
router.get('/contact', (req, res) => {
  const pageData = createPageData({
    title: 'Contact Us',
    description: 'Get in touch with the LeadLeader team',
    path: '/contact'
  });
  
  res.render('contact', {
    ...pageData,
    hcaptchaSitekey: config.HCAPTCHA_SITEKEY || null
  });
});

// ───────────────────────────────────────────────
// ROUTE: /privacy - Privacy Policy
// ───────────────────────────────────────────────
router.get('/privacy', (req, res) => {
  res.render('privacy', { title: 'Privacy Policy' });
});

// ───────────────────────────────────────────────
// ROUTE: /terms - Terms of Service
// ───────────────────────────────────────────────
router.get('/terms', (req, res) => {
  res.render('terms', { title: 'Terms of Service' });
});

module.exports = router;
