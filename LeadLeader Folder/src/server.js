// ═══════════════════════════════════════════════════════════
// SERVER.JS - Application entrypoint
// ═══════════════════════════════════════════════════════════
// Starts the Express server and handles graceful shutdown

require('dotenv').config();
const app = require('./app');
const config = require('./utils/config');

const PORT = config.PORT || 8080;

// ───────────────────────────────────────────────
// Start server
// ───────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server_started',
    port: PORT,
    env: config.NODE_ENV,
    features: {
      transcribe: config.ENABLE_TRANSCRIBE,
      polly: config.ENABLE_POLLY
    }
  }));
  
  console.log(`\n🎙️  LeadLeader Platform v0.1 (beta)`);
  console.log(`📍 Server listening on port ${PORT}`);
  console.log(`🌐 Environment: ${config.NODE_ENV}`);
  console.log(`🔧 Features: Transcribe=${config.ENABLE_TRANSCRIBE}, Polly=${config.ENABLE_POLLY}`);
  console.log(`\n✅ Ready to accept requests\n`);
});

// ───────────────────────────────────────────────
// Graceful shutdown handler
// ───────────────────────────────────────────────
function shutdown(signal) {
  console.log(JSON.stringify({
    level: 'info',
    event: 'shutdown_initiated',
    signal
  }));

  server.close(() => {
    console.log(JSON.stringify({
      level: 'info',
      event: 'server_closed'
    }));
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error(JSON.stringify({
      level: 'error',
      event: 'shutdown_timeout'
    }));
    process.exit(1);
  }, 10000);
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({
    level: 'fatal',
    event: 'uncaught_exception',
    error: err.message,
    stack: err.stack
  }));
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(JSON.stringify({
    level: 'fatal',
    event: 'unhandled_rejection',
    reason: String(reason),
    promise: String(promise)
  }));
  process.exit(1);
});
