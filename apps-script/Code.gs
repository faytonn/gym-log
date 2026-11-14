/**
 * Gym Log -> Google Sheets sync endpoint.
 *
 * Bind this script to the "Workout Log" spreadsheet (Extensions > Apps Script),
 * set the script property SYNC_TOKEN, and deploy it as a web app.
 * See README.md, section "Google Sheets sync".
 *
 * Request (POST, body is JSON sent as text/plain):
 *   { "token": "...", "ping": true }                       -> connection test
 *   { "token": "...", "sessionId": "...", "rows": [[...]] } -> append rows
 * Each row: Date | Exercise | Weight (kg) | Set 1 | Set 2 | Set 3 | Set 4 | Reps left in tank | Notes
 *
 * Response: { "ok": true, "appended": n } or { "ok": true, "duplicate": true } or { "ok": false, "error": "..." }
 */

var LOG_SHEET = 'Log';
var SYNC_SHEET = '_sync'; // hidden tab listing session IDs already written, so retries never duplicate rows
var COLUMNS = 9;

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    var expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
    if (!expected) return json_({ ok: false, error: 'SYNC_TOKEN is not set in Script Properties' });
    if (body.token !== expected) return json_({ ok: false, error: 'Bad token' });

    if (body.ping) return json_({ ok: true, ping: true });

    var sessionId = String(body.sessionId || '');
    var rows = body.rows;
    if (!sessionId) return json_({ ok: false, error: 'Missing sessionId' });
    if (!Array.isArray(rows)) return json_({ ok: false, error: 'Missing rows' });

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var log = ss.getSheetByName(LOG_SHEET);
      if (!log) return json_({ ok: false, error: 'No tab named "' + LOG_SHEET + '"' });
      var sync = getSyncSheet_(ss);

      if (alreadySynced_(sync, sessionId)) return json_({ ok: true, duplicate: true });

      if (rows.length > 0) {
        var values = rows.map(normalizeRow_);
        log.getRange(log.getLastRow() + 1, 1, values.length, COLUMNS).setValues(values);
      }
      sync.appendRow([sessionId, new Date(), rows.length]);
      return json_({ ok: true, appended: rows.length });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Visiting the URL in a browser shows this, which confirms the deployment works. */
function doGet() {
  return json_({ ok: true, service: 'gym-log-sync' });
}

function normalizeRow_(row) {
  var out = [];
  for (var i = 0; i < COLUMNS; i++) out.push(row[i] === undefined || row[i] === null ? '' : row[i]);
  // "2026-11-14" -> real date cell (local time, no timezone shift)
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(out[0]));
  if (m) out[0] = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return out;
}

function getSyncSheet_(ss) {
  var sheet = ss.getSheetByName(SYNC_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SYNC_SHEET);
    sheet.appendRow(['Session ID', 'Synced at', 'Rows']);
    sheet.hideSheet();
  }
  return sheet;
}

function alreadySynced_(sheet, sessionId) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === sessionId) return true;
  return false;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
