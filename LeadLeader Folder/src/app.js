// ═══════════════════════════════════════════════════════════
// APP.JS - Express application configuration
// ═══════════════════════════════════════════════════════════

const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const session = require('express-session');
const fs = require('fs');

const config = require('./utils/config');
const abuse = require('./utils/abuse');
const usersStore = require('./utils/usersStore');

// Initialize users store
usersStore.initStore().catch(err => {
  console.error('Failed to initialize users store:', err);
});

// Import route modules
const mainRoutes = require('./routes/main');
const demoRoutes = require('./routes/demo');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const apiV1Routes = require('./routes/api/v1');
const tryRoutes = require('./routes/try');
const systemRoutes = require('./routes/system');
const ownerRoutes = require('./routes/owner');
const authRoutes = require('./routes/auth');

// Simple defensive routes (no dependencies on complex state)
const trySimpleRoutes = require('./routes/try_simple');
const systemSimpleRoutes = require('./routes/system_simple');

// ───────────────────────────────────────────────
// Initialize Express app
// ───────────────────────────────────────────────
const app = express();

// ───────────────────────────────────────────────
// Security middleware (helmet)
// ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Allow Tailwind CDN
  crossOriginEmbedderPolicy: false
}));

// ───────────────────────────────────────────────
// Session middleware
// ───────────────────────────────────────────────
app.use(session({
  secret: config.SESSION_SECRET || 'fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// ───────────────────────────────────────────────
// View engine setup (EJS with layouts)
// ───────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Mount layout-free routes BEFORE expressLayouts middleware
app.use('/', systemRoutes);
app.use('/', tryRoutes);

app.use(expressLayouts);
app.set('layout', 'layout');

// ───────────────────────────────────────────────
// Middleware
// ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// ───────────────────────────────────────────────
// Template locals middleware
// ───────────────────────────────────────────────
app.use((req, res, next) => {
  // Set default locals for all templates
  res.locals.version = 'v0.1';
  res.locals.year = new Date().getFullYear();
  res.locals.session = req.session || null;
  res.locals.navItems = [
    { href: '/', label: 'Home', active: req.path === '/' },
    { href: '/demo', label: 'Demo', active: req.path.startsWith('/demo') },
    { href: '/try', label: 'Try It', active: req.path === '/try' },
    { href: '/contact', label: 'Contact', active: req.path === '/contact' }
  ];
  res.locals.description = res.locals.description || 'LeadLeader - AI-powered call assistant';
  next();
});

// ───────────────────────────────────────────────
// Request ID and latency tracking
// ───────────────────────────────────────────────
let requestCounter = 0;

app.use((req, res, next) => {
  // Generate request ID
  const reqId = `req-${Date.now()}-${++requestCounter}`;
  req.id = reqId;
  res.set('X-Request-Id', reqId);
  
  // Track start time
  req.startTime = process.hrtime.bigint();
  
  // Capture response finish
  const originalSend = res.send;
  res.send = function(data) {
    if (!req._logged) {
      req._logged = true;
      const endTime = process.hrtime.bigint();
      const ms = Number(endTime - req.startTime) / 1_000_000;
      
      // Log request
      const logData = {
        level: 'info',
        event: 'request',
        reqId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: ms.toFixed(2),
        ip: req.ip,
        ua: req.get('user-agent')?.substring(0, 50)
      };
      console.log(JSON.stringify(logData));
      
      // Record latency
      abuse.recordLatency({
        ts: Date.now(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: parseFloat(ms.toFixed(2))
      });
      
      // NDJSON metrics logging
      try {
        const metricsPath = '/tmp/metrics.jsonl';
        const line = JSON.stringify(logData) + '\n';
        
        // Simple rotation: if file > 5MB, truncate
        if (fs.existsSync(metricsPath)) {
          const stats = fs.statSync(metricsPath);
          if (stats.size > 5 * 1024 * 1024) {
            fs.writeFileSync(metricsPath, line);
          } else {
            fs.appendFileSync(metricsPath, line);
          }
        } else {
          fs.writeFileSync(metricsPath, line);
        }
      } catch (err) {
        // Silent fail - don't crash on metrics
      }
    }
    
    return originalSend.call(this, data);
  };
  
  next();
});

// ───────────────────────────────────────────────
// Global abuse protection
// ───────────────────────────────────────────────
app.use(abuse.globalGuard);

// ───────────────────────────────────────────────
// Health check endpoint
// ───────────────────────────────────────────────
app.get('/_health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    env: config.safe()
  });
});

// ───────────────────────────────────────────────
// Cron endpoint (placeholder)
// ───────────────────────────────────────────────
app.get('/cron/daily', (req, res) => {
  const cronSecret = req.query.secret || req.get('x-cron-secret');
  
  if (config.CRON_SECRET && cronSecret !== config.CRON_SECRET) {
    return res.status(403).json({ ok: false, error: 'Invalid cron secret' });
  }

  console.log(JSON.stringify({
    level: 'info',
    event: 'cron_triggered',
    job: 'daily'
  }));

  // TODO: Implement daily tasks
  // - Cleanup old audio files
  // - Generate daily reports
  // - Send summary emails

  res.json({
    ok: true,
    message: 'Daily cron job executed'
  });
});

// ───────────────────────────────────────────────
// Mount route modules
// ───────────────────────────────────────────────
app.use('/', authRoutes); // Auth routes (login, signup, logout, dashboard)
app.use('/', mainRoutes);
app.use('/', demoRoutes);
app.use('/', dashboardRoutes);
app.use('/', apiRoutes);
app.use('/', adminRoutes);
app.use('/api/v1', apiV1Routes);
// systemRoutes and tryRoutes mounted earlier (before expressLayouts)
app.use('/owner', ownerRoutes);

// ───────────────────────────────────────────────
// 404 handler
// ───────────────────────────────────────────────
app.use((req, res) => {
  // For API/JSON requests, return JSON 404
  if (req.path.startsWith('/api') || req.accepts('json') && !req.accepts('html')) {
    return res.status(404).json({
      ok: false,
      error: 'Not found',
      path: req.path
    });
  }
  // For browser requests, render 404 page
  res.status(404).render('404', { title: '404 - Page Not Found' });
});

// ───────────────────────────────────────────────
// Error handler
// ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'unhandled_error',
    error: err.message,
    stack: err.stack,
    path: req.path
  }));

  // For API/JSON requests, return JSON error
  if (req.path.startsWith('/api') || req.accepts('json') && !req.accepts('html')) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Internal server error'
    });
  }
  
  // For browser requests, render 500 page
  res.status(err.status || 500).render('500', { title: '500 - Server Error' });
});

module.exports = app;

// legal (privacy/terms)
const legalRoutes = require('./routes/legal');
app.use(legalRoutes);
