// ═══════════════════════════════════════════════════════════
// ROUTE: /dashboard.js - Display Google Sheets transcription data
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { createPageData, formatDuration, formatTimestamp } = require('../utils/helpers');
const { getSheetData } = require('../utils/sheets');
const config = require('../utils/config');

// ───────────────────────────────────────────────
// ROUTE: /dashboard - Display last 10 transcriptions
// SOURCE: Google Sheets (utils/sheets.js)
// ───────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const pageData = createPageData({
    title: 'Dashboard',
    description: 'View recent voice transcriptions and analytics',
    path: '/dashboard'
  });

  try {
    // Fetch data from Google Sheets
    const spreadsheetId = config.SHEETS_SPREADSHEET_ID;
    const sheetName = 'Calls';
    
    let rows = [];
    let stats = {
      total: 0,
      avgDuration: '0s',
      today: 0,
      lastUpdate: 'N/A'
    };

    if (spreadsheetId && config.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        const data = await getSheetData(spreadsheetId, sheetName, config);
        
        if (data && data.length > 1) {
          // Skip header row, get last 10 entries
          const dataRows = data.slice(1);
          rows = dataRows.slice(-10).reverse().map(row => ({
            Timestamp: row[0] || '',
            Tenant: row[1] || '',
            Source: row[2] || '',
            DurationSec: parseFloat(row[3]) || 0,
            OrigFile: row[4] || '',
            StoredPaths: row[5] || '',
            Transcript: row[6] || ''
          }));

          // Calculate stats
          stats.total = dataRows.length;
          
          const durations = dataRows
            .map(row => parseFloat(row[3]))
            .filter(d => !isNaN(d) && d > 0);
          
          if (durations.length > 0) {
            const avgDur = durations.reduce((a, b) => a + b, 0) / durations.length;
            stats.avgDuration = formatDuration(avgDur);
          }

          // Count today's calls
          const today = new Date().toISOString().split('T')[0];
          stats.today = dataRows.filter(row => {
            const timestamp = row[0] || '';
            return timestamp.startsWith(today);
          }).length;

          // Last update time
          if (dataRows.length > 0) {
            const lastRow = dataRows[dataRows.length - 1];
            stats.lastUpdate = lastRow[0] ? formatTimestamp(lastRow[0]) : 'Unknown';
          }
        }
      } catch (err) {
        console.error('[dashboard] Failed to fetch sheets data:', err.message);
        // Continue with empty data
      }
    }

    res.render('dashboard', {
      ...pageData,
      rows,
      stats
    });
  } catch (err) {
    console.error('[dashboard] Error rendering dashboard:', err);
    res.status(500).send('Failed to load dashboard');
  }
});

module.exports = router;
