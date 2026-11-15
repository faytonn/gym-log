/**
 * Gym Log -> Google Sheets sync endpoint and training log.
 *
 * Setup (details in README.md, section "Google Sheets sync"):
 *   1. Paste this file into Extensions > Apps Script of the spreadsheet.
 *   2. Run the function `setup` once. It creates the sync token and the extra tabs,
 *      and prints the token in the execution log.
 *   3. Deploy as a web app (Execute as: Me, Who has access: Anyone).
 *
 * Tabs this script writes:
 *   Log       one row per exercise (existing tab, columns unchanged)
 *   Sets      one row per set, the raw data for everything below
 *   Sessions  one row per workout
 *   Dashboard, Progress, Weekly, PRs   rebuilt from Sets after every sync; do not edit by hand
 *   _sync     hidden list of session IDs already written, so retries never duplicate rows
 *
 * Request (POST, body is JSON sent as text/plain):
 *   { "token": "...", "ping": true }
 *   { "token": "...", "sessionId": "...", "rows": [[...]], "sets": [[...]], "session": [...] }
 * Response: { "ok": true, "appended": n } | { "ok": true, "duplicate": true } | { "ok": false, "error": "..." }
 */

var LOG_SHEET = 'Log';
var SETS_SHEET = 'Sets';
var SESSIONS_SHEET = 'Sessions';
var SYNC_SHEET = '_sync';
var LOG_COLUMNS = 9;
var SETS_HEADER = ['Date', 'Session ID', 'Day', 'Exercise', 'Type', 'Set', 'Weight (kg)', 'Reps', 'Reps left in tank', 'Primary muscles', 'Secondary muscles'];
var SESSIONS_HEADER = ['Date', 'Session ID', 'Day', 'Start', 'Duration (min)', 'Exercises', 'Sets', 'Volume (kg)'];
var SYNC_HEADER = ['Session ID', 'Synced at', 'Rows'];
var TREND_SESSIONS = 8;

// ---------------------------------------------------------------- web app

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    var expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
    if (!expected) return json_({ ok: false, error: 'SYNC_TOKEN is not set. Run setup() in the script editor.' });
    if (body.token !== expected) return json_({ ok: false, error: 'Bad token' });

    if (body.ping) return json_({ ok: true, ping: true });

    var sessionId = String(body.sessionId || '');
    var rows = body.rows;
    if (!sessionId) return json_({ ok: false, error: 'Missing sessionId' });
    if (!Array.isArray(rows)) return json_({ ok: false, error: 'Missing rows' });
    var sets = Array.isArray(body.sets) ? body.sets : [];
    var session = Array.isArray(body.session) ? body.session : null;

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var log = ss.getSheetByName(LOG_SHEET);
      if (!log) return json_({ ok: false, error: 'No tab named "' + LOG_SHEET + '"' });

      // Resolve every tab before writing anything, so a missing tab cannot leave a half-written session.
      var sync = getOrCreate_(ss, SYNC_SHEET, SYNC_HEADER, true);
      var setsSheet = getOrCreate_(ss, SETS_SHEET, SETS_HEADER, false);
      var sessionsSheet = getOrCreate_(ss, SESSIONS_SHEET, SESSIONS_HEADER, false);

      if (alreadySynced_(sync, sessionId)) return json_({ ok: true, duplicate: true });

      appendRows_(log, rows, LOG_COLUMNS);
      appendRows_(setsSheet, sets, SETS_HEADER.length);
      if (session) appendRows_(sessionsSheet, [session], SESSIONS_HEADER.length);
      sync.appendRow([sessionId, new Date(), rows.length]);

      // The summary tabs are a convenience. A failure here must not fail the sync.
      var result = { ok: true, appended: rows.length };
      try {
        rebuildSummaries_(ss);
      } catch (err) {
        result.summaryError = String(err);
      }
      return json_(result);
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

// ---------------------------------------------------------------- run from the editor or the sheet menu

/** Run once from the script editor. Creates the token and the tabs, and logs the token. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('SYNC_TOKEN');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('SYNC_TOKEN', token);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreate_(ss, SYNC_SHEET, SYNC_HEADER, true);
  getOrCreate_(ss, SETS_SHEET, SETS_HEADER, false);
  getOrCreate_(ss, SESSIONS_SHEET, SESSIONS_HEADER, false);
  rebuildSummaries_(ss);
  Logger.log('Sync token (paste it into the app, Settings > Google Sheets sync): ' + token);
  return token;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Gym Log')
    .addItem('Rebuild summary tabs', 'rebuildSummaries')
    .addItem('Show sync token', 'showToken')
    .addToUi();
}

function rebuildSummaries() {
  rebuildSummaries_(SpreadsheetApp.getActiveSpreadsheet());
}

function showToken() {
  var token = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  SpreadsheetApp.getUi().alert(token ? 'Sync token:\n\n' + token : 'No token yet. Run setup() in the script editor.');
}

// ---------------------------------------------------------------- sheet helpers

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreate_(ss, name, header, hidden) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (header) {
      sheet.appendRow(header);
      style_(sheet, header.length);
    }
    if (hidden) sheet.hideSheet();
  }
  return sheet;
}

function style_(sheet, width) {
  try {
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, width).setFontWeight('bold');
  } catch (err) {
    /* formatting is optional */
  }
}

function alreadySynced_(sheet, sessionId) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === sessionId) return true;
  return false;
}

function appendRows_(sheet, rows, width) {
  if (!rows.length) return;
  var values = [];
  for (var i = 0; i < rows.length; i++) values.push(normalizeRow_(rows[i], width));
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, width).setValues(values);
}

function normalizeRow_(row, width) {
  var out = [];
  for (var i = 0; i < width; i++) out.push(row[i] === undefined || row[i] === null ? '' : row[i]);
  // "2026-11-14" -> real date cell (local time, no timezone shift)
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(out[0]));
  if (m) out[0] = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return out;
}

function rebuildSummaries_(ss) {
  var setsSheet = ss.getSheetByName(SETS_SHEET);
  var last = setsSheet ? setsSheet.getLastRow() : 0;
  var rows = last >= 2 ? setsSheet.getRange(2, 1, last - 1, SETS_HEADER.length).getValues() : [];
  var s = summarize_(rows, new Date());

  writeTab_(ss, 'Dashboard', s.dashboard);
  var progress = writeTab_(ss, 'Progress', s.progress);
  writeTab_(ss, 'Weekly', s.weekly);
  writeTab_(ss, 'PRs', s.prs);

  // Trend sparklines. One-argument formulas, so they work in any spreadsheet locale.
  for (var i = 0; i < s.trendCounts.length; i++) {
    if (s.trendCounts[i] < 2) continue;
    var row = i + 2;
    var range = columnLetter_(s.trendFirstColumn) + row + ':' + columnLetter_(s.trendFirstColumn + s.trendCounts[i] - 1) + row;
    progress.getRange(row, s.trendColumn).setFormula('=SPARKLINE(' + range + ')');
  }
}

function writeTab_(ss, name, rows) {
  var sheet = getOrCreate_(ss, name, null, false);
  sheet.clearContents();
  var width = 1;
  for (var i = 0; i < rows.length; i++) width = Math.max(width, rows[i].length);
  var values = [];
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j].slice();
    while (r.length < width) r.push('');
    values.push(r);
  }
  if (values.length) sheet.getRange(1, 1, values.length, width).setValues(values);
  style_(sheet, width);
  return sheet;
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = (n - m - 1) / 26;
  }
  return s;
}

// ---------------------------------------------------------------- summaries (pure functions)

function dateKey_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var p = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
  }
  return String(v).slice(0, 10);
}

/** Monday of the week that contains the given "YYYY-MM-DD". */
function weekStart_(key) {
  var d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey_(d);
}

function addDays_(key, days) {
  var d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + days);
  return dateKey_(d);
}

function round1_(n) {
  return Math.round(n * 10) / 10;
}

function splitList_(v) {
  var out = [];
  var parts = String(v || '').split(',');
  for (var i = 0; i < parts.length; i++) {
    var t = parts[i].replace(/^\s+|\s+$/g, '');
    if (t) out.push(t);
  }
  return out;
}

function parseSets_(rows) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r[3]) continue;
    out.push({
      date: dateKey_(r[0]),
      session: String(r[1]),
      exercise: String(r[3]),
      type: String(r[4] || 'weight'),
      weight: Number(r[6]) || 0,
      reps: Number(r[7]) || 0,
      primary: splitList_(r[9]),
      secondary: splitList_(r[10]),
    });
  }
  return out;
}

/** Epley estimate of a one-rep max. */
function e1rm_(weight, reps) {
  return weight * (1 + reps / 30);
}

/**
 * Groups sets into one record per exercise per session, oldest first, with the numbers the
 * summary tabs need. For "assist" the best weight is the lowest one.
 */
function exerciseHistory_(sets) {
  var byExercise = {};
  var order = [];
  for (var i = 0; i < sets.length; i++) {
    var s = sets[i];
    var key = s.exercise.toLowerCase().replace(/\s+/g, ' ').replace(/^ | $/g, '');
    if (!byExercise[key]) {
      byExercise[key] = { name: s.exercise, type: s.type, sessions: {}, list: [] };
      order.push(key);
    }
    var ex = byExercise[key];
    ex.type = s.type;
    var rec = ex.sessions[s.session];
    if (!rec) {
      rec = ex.sessions[s.session] = { date: s.date, sets: [] };
      ex.list.push(rec);
    }
    rec.sets.push(s);
  }
  var out = [];
  for (var k = 0; k < order.length; k++) {
    var e = byExercise[order[k]];
    e.list.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    for (var j = 0; j < e.list.length; j++) measure_(e.list[j], e.type);
    out.push({ name: e.name, type: e.type, sessions: e.list });
  }
  out.sort(function (a, b) {
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
  });
  return out;
}

function measure_(rec, type) {
  var top = null;
  var topReps = 0;
  var best1rm = 0;
  var score = 0;
  var mostReps = 0;
  for (var i = 0; i < rec.sets.length; i++) {
    var s = rec.sets[i];
    var better = top === null || (type === 'assist' ? s.weight < top : s.weight > top);
    if (better) {
      top = s.weight;
      topReps = s.reps;
    } else if (s.weight === top && s.reps > topReps) {
      topReps = s.reps;
    }
    mostReps = Math.max(mostReps, s.reps);
    best1rm = Math.max(best1rm, e1rm_(s.weight, s.reps));
    var load = type === 'bodyweight' ? 1 : type === 'assist' ? Math.max(0, 100 - s.weight) : s.weight;
    score = Math.max(score, e1rm_(load, s.reps));
  }
  rec.top = top === null ? 0 : top;
  rec.topReps = topReps;
  rec.mostReps = mostReps;
  rec.e1rm = type === 'weight' ? best1rm : null;
  rec.score = score;
}

/** Personal records in date order. The first session of an exercise is the baseline, not a record. */
function findPrs_(history) {
  var prs = [];
  for (var i = 0; i < history.length; i++) {
    var ex = history[i];
    var best = null;
    for (var j = 0; j < ex.sessions.length; j++) {
      var s = ex.sessions[j];
      if (!best) {
        best = { top: s.top, topReps: s.topReps, e1rm: s.e1rm, reps: s.mostReps };
        continue;
      }
      if (ex.type === 'bodyweight') {
        if (s.mostReps > best.reps) {
          prs.push({ date: s.date, exercise: ex.name, type: 'Reps', value: s.mostReps + ' reps', before: best.reps + ' reps' });
          best.reps = s.mostReps;
        }
        continue;
      }
      var heavier = ex.type === 'assist' ? s.top < best.top : s.top > best.top;
      if (heavier) {
        prs.push({ date: s.date, exercise: ex.name, type: ex.type === 'assist' ? 'Less assist' : 'Weight', value: s.top + ' kg', before: best.top + ' kg' });
        best.top = s.top;
        best.topReps = s.topReps;
      } else if (s.top === best.top && s.topReps > best.topReps) {
        prs.push({ date: s.date, exercise: ex.name, type: 'Reps at ' + s.top + ' kg', value: s.topReps + ' reps', before: best.topReps + ' reps' });
        best.topReps = s.topReps;
      }
      if (ex.type === 'weight' && s.e1rm > best.e1rm + 0.049) {
        prs.push({ date: s.date, exercise: ex.name, type: 'Est. 1RM', value: round1_(s.e1rm) + ' kg', before: round1_(best.e1rm) + ' kg' });
        best.e1rm = s.e1rm;
      }
    }
  }
  prs.sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
  return prs;
}

/** Per week: sessions, sets, volume and weighted sets per muscle (primary 1, secondary 0.5). */
function weeklyStats_(sets) {
  var weeks = {};
  var muscles = {};
  for (var i = 0; i < sets.length; i++) {
    var s = sets[i];
    var wk = weekStart_(s.date);
    var w = weeks[wk] || (weeks[wk] = { sessions: {}, sets: 0, volume: 0, muscles: {} });
    w.sessions[s.session] = true;
    w.sets++;
    if (s.type === 'weight') w.volume += s.weight * s.reps;
    var seen = {};
    for (var p = 0; p < s.primary.length; p++) {
      var pm = s.primary[p];
      if (seen[pm]) continue;
      seen[pm] = true;
      w.muscles[pm] = (w.muscles[pm] || 0) + 1;
      muscles[pm] = (muscles[pm] || 0) + 1;
    }
    for (var q = 0; q < s.secondary.length; q++) {
      var sm = s.secondary[q];
      if (seen[sm]) continue;
      seen[sm] = true;
      w.muscles[sm] = (w.muscles[sm] || 0) + 0.5;
      muscles[sm] = (muscles[sm] || 0) + 0.5;
    }
  }
  var names = Object.keys(muscles).sort(function (a, b) {
    return muscles[b] - muscles[a] || (a < b ? -1 : 1);
  });
  var keys = Object.keys(weeks).sort().reverse();
  return { weeks: weeks, keys: keys, muscles: names };
}

function summarize_(rows, now) {
  var sets = parseSets_(rows);
  var history = exerciseHistory_(sets);
  var prs = findPrs_(history);
  var weekly = weeklyStats_(sets);
  var i, j;

  // ---- Progress
  var trendColumn = 13;
  var trendFirstColumn = 14;
  var progressHeader = ['Exercise', 'Type', 'Sessions', 'First', 'Last', 'First best set', 'Latest best set', 'Best weight (kg)', 'Est. 1RM first', 'Est. 1RM latest', 'Est. 1RM best', 'Change %', 'Trend'];
  for (i = TREND_SESSIONS; i >= 1; i--) progressHeader.push(i === 1 ? 'Latest' : '-' + (i - 1));
  var progress = [progressHeader];
  var trendCounts = [];
  for (i = 0; i < history.length; i++) {
    var ex = history[i];
    var first = ex.sessions[0];
    var lastS = ex.sessions[ex.sessions.length - 1];
    var bestTop = first.top;
    var best1rm = 0;
    for (j = 0; j < ex.sessions.length; j++) {
      var sj = ex.sessions[j];
      if (ex.type === 'assist' ? sj.top < bestTop : sj.top > bestTop) bestTop = sj.top;
      if (sj.e1rm !== null) best1rm = Math.max(best1rm, sj.e1rm);
    }
    var weighted = ex.type === 'weight';
    var change = first.score > 0 ? round1_(((lastS.score - first.score) / first.score) * 100) : '';
    var row = [
      ex.name,
      ex.type,
      ex.sessions.length,
      first.date,
      lastS.date,
      first.top + ' × ' + first.topReps,
      lastS.top + ' × ' + lastS.topReps,
      ex.type === 'bodyweight' ? '' : bestTop,
      weighted ? round1_(first.e1rm) : '',
      weighted ? round1_(lastS.e1rm) : '',
      weighted ? round1_(best1rm) : '',
      change,
      '',
    ];
    var recent = ex.sessions.slice(-TREND_SESSIONS);
    for (j = 0; j < recent.length; j++) row.push(round1_(recent[j].score));
    trendCounts.push(recent.length);
    progress.push(row);
  }

  // ---- Weekly
  var weeklyRows = [['Week of', 'Sessions', 'Sets', 'Volume (kg)'].concat(weekly.muscles)];
  for (i = 0; i < weekly.keys.length; i++) {
    var wk = weekly.weeks[weekly.keys[i]];
    var wr = [weekly.keys[i], Object.keys(wk.sessions).length, wk.sets, round1_(wk.volume)];
    for (j = 0; j < weekly.muscles.length; j++) wr.push(wk.muscles[weekly.muscles[j]] || 0);
    weeklyRows.push(wr);
  }

  // ---- PRs (newest first)
  var prRows = [['Date', 'Exercise', 'Record', 'New', 'Before']];
  for (i = prs.length - 1; i >= 0; i--) prRows.push([prs[i].date, prs[i].exercise, prs[i].type, prs[i].value, prs[i].before]);

  // ---- Dashboard
  var thisWeek = weekStart_(dateKey_(now));
  var lastWeek = addDays_(thisWeek, -7);
  var sessionIds = {};
  for (i = 0; i < sets.length; i++) sessionIds[sets[i].session] = true;
  var tw = weekly.weeks[thisWeek];
  var lw = weekly.weeks[lastWeek];
  var dashboard = [
    ['Gym Log', ''],
    ['Updated', now],
    ['', ''],
    ['Workouts logged', Object.keys(sessionIds).length],
    ['Sets logged', sets.length],
    ['Weeks trained', weekly.keys.length],
    ['Workouts this week', tw ? Object.keys(tw.sessions).length : 0],
    ['Sets this week', tw ? tw.sets : 0],
    ['Records this week', countSince_(prs, thisWeek)],
    ['', ''],
    ['Hard sets per muscle', 'This week', 'Last week', '4-week average'],
  ];
  for (i = 0; i < weekly.muscles.length; i++) {
    var mu = weekly.muscles[i];
    var sum = 0;
    for (j = 1; j <= 4; j++) {
      var past = weekly.weeks[addDays_(thisWeek, -7 * j)];
      sum += past ? past.muscles[mu] || 0 : 0;
    }
    dashboard.push([mu, tw ? tw.muscles[mu] || 0 : 0, lw ? lw.muscles[mu] || 0 : 0, round1_(sum / 4)]);
  }
  dashboard.push(['', '']);
  dashboard.push(['Latest records', '', '', '', '']);
  dashboard.push(['Date', 'Exercise', 'Record', 'New', 'Before']);
  for (i = prs.length - 1; i >= 0 && i >= prs.length - 8; i--) dashboard.push([prs[i].date, prs[i].exercise, prs[i].type, prs[i].value, prs[i].before]);
  if (!prs.length) dashboard.push(['No records yet. They appear from the second session of an exercise.']);

  return { dashboard: dashboard, progress: progress, weekly: weeklyRows, prs: prRows, trendCounts: trendCounts, trendColumn: trendColumn, trendFirstColumn: trendFirstColumn };
}

function countSince_(prs, key) {
  var n = 0;
  for (var i = 0; i < prs.length; i++) if (prs[i].date >= key) n++;
  return n;
}
