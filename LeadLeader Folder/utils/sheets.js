// utils/sheets.js
// Google Sheets integration with auto-header creation
const { google } = require('googleapis');

let sheetsClient = null;
let sheetsService = null;

/**
 * Initialize Google Sheets client (lazy)
 * @param {object} config - Configuration with GOOGLE_SERVICE_ACCOUNT_JSON
 * @returns {object} - { client, sheets }
 */
function getSheetsClient(config) {
  if (!sheetsClient) {
    if (!config.GOOGLE_SERVICE_ACCOUNT_JSON) {
      throw new Error('Google Service Account not configured');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: config.GOOGLE_SERVICE_ACCOUNT_JSON,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    sheetsClient = auth;
    sheetsService = google.sheets({ version: 'v4', auth });
  }

  return { client: sheetsClient, sheets: sheetsService };
}

/**
 * Ensure sheet exists with proper headers
 * @param {string} spreadsheetId - Google Sheets spreadsheet ID
 * @param {string} sheetName - Sheet name (default: "Calls")
 * @param {object} config - Configuration
 * @returns {Promise<void>}
 */
async function ensureSheetWithHeaders(spreadsheetId, sheetName = 'Calls', config) {
  const { sheets } = getSheetsClient(config);

  try {
    // Try to get the sheet
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`${sheetName}!A1:Z1`],
      fields: 'sheets.properties'
    });

    // Check if sheet exists
    const sheetExists = response.data.sheets.some(
      sheet => sheet.properties.title === sheetName
    );

    if (!sheetExists) {
      // Create sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }]
        }
      });
    }

    // Check if headers exist (read A1)
    const headersResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:Z1`
    });

    const hasHeaders = headersResponse.data.values && headersResponse.data.values.length > 0;

    if (!hasHeaders) {
      // Write headers
      const headers = [
        'Timestamp',
        'Tenant',
        'Source',
        'DurationSec',
        'OrigFile',
        'StoredPaths',
        'Transcript'
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:G1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers]
        }
      });
    }
  } catch (error) {
    throw new Error(`Failed to ensure sheet headers: ${error.message}`);
  }
}

/**
 * Append row to Google Sheet
 * @param {string} spreadsheetId - Google Sheets spreadsheet ID
 * @param {string} sheetName - Sheet name
 * @param {Array} rowData - Array of values for the row
 * @param {object} config - Configuration
 * @returns {Promise<object>} - Append result
 */
async function appendRow(spreadsheetId, sheetName = 'Calls', rowData, config) {
  const { sheets } = getSheetsClient(config);

  try {
    // Ensure headers exist first
    await ensureSheetWithHeaders(spreadsheetId, sheetName, config);

    // Append the row
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData]
      }
    });

    return response.data;
  } catch (error) {
    throw new Error(`Failed to append row to sheet: ${error.message}`);
  }
}

/**
 * Append call record to Calls sheet
 * @param {object} callData - Call data object
 * @param {object} config - Configuration
 * @returns {Promise<object>}
 */
async function appendCallRecord(callData, config) {
  if (!config.SHEETS_SPREADSHEET_ID) {
    throw new Error('SHEETS_SPREADSHEET_ID not configured');
  }

  const rowData = [
    callData.timestamp || new Date().toISOString(),
    callData.tenantId || config.TENANT_ID || 'demo',
    callData.source || 'demo',
    callData.durationSec || 0,
    callData.origFile || '',
    callData.storedPaths || '',
    callData.transcript || ''
  ];

  return await appendRow(
    config.SHEETS_SPREADSHEET_ID,
    'Calls',
    rowData,
    config
  );
}

module.exports = {
  ensureSheetWithHeaders,
  appendRow,
  appendCallRecord
};
