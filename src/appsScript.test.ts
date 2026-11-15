// Runs apps-script/Code.gs against a small in-memory stand-in for the Google Sheets API.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { sessionSummaryRow, sessionToRows, sessionToSetRows } from './export';
import { defaultMuscles } from './muscles';
import type { LoadKind, Session } from './types';

type Cell = string | number | Date;

class FakeSheet {
  rows: Cell[][] = [];
  hidden = false;
  formulas = new Map<string, string>();
  constructor(readonly name: string) {}
  getLastRow() {
    return this.rows.length;
  }
  appendRow(r: Cell[]) {
    this.rows.push([...r]);
  }
  clearContents() {
    this.rows = [];
    this.formulas.clear();
  }
  hideSheet() {
    this.hidden = true;
  }
  setFrozenRows() {}
  getRange(row: number, col: number, nr = 1, nc = 1) {
    const sheet = this;
    return {
      setValues(v: Cell[][]) {
        // The real API throws when the data does not match the range size.
        if (v.length !== nr || v.some((r) => r.length !== nc)) throw new Error(`setValues: data does not match range ${nr}x${nc}`);
        v.forEach((r, i) => {
          const target = (sheet.rows[row - 1 + i] ??= []);
          r.forEach((c, j) => (target[col - 1 + j] = c));
        });
      },
      getValues() {
        return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sheet.rows[row - 1 + i]?.[col - 1 + j] ?? ''));
      },
      setFormula(f: string) {
        sheet.formulas.set(`${row},${col}`, f);
      },
      setFontWeight() {
        return this;
      },
    };
  }
}

function makeEnv() {
  const sheets = new Map<string, FakeSheet>();
  const log = new FakeSheet('Log');
  log.appendRow(['Date', 'Exercise', 'Weight (kg)', 'Set 1', 'Set 2', 'Set 3', 'Set 4', 'Reps left in tank', 'Notes']);
  sheets.set('Log', log);
  const props = new Map<string, string>([['SYNC_TOKEN', 'secret']]);
  const ss = {
    getSheetByName: (n: string) => sheets.get(n) ?? null,
    insertSheet: (n: string) => {
      const s = new FakeSheet(n);
      sheets.set(n, s);
      return s;
    },
  };
  let uuid = 0;
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
    Utilities: { getUuid: () => `0000-${++uuid}` },
    Logger: { log() {} },
  });
  vm.runInContext(readFileSync(resolve(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
  const post = (body: object) => JSON.parse((ctx as any).doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return { sheets, props, ctx: ctx as any, post };
}

const targets = (name: string) => defaultMuscles(name);
const DAY = 86_400_000;

function workout(id: string, finishedAt: number, entries: [name: string, kind: LoadKind, weight: number, reps: number[]][]): Session {
  return {
    id,
    dayId: 'sat',
    dayLabel: 'Sat',
    dayName: 'Shoulders & arms',
    startedAt: finishedAt - 50 * 60_000,
    finishedAt,
    synced: 0,
    entries: entries.map(([name, kind, weight, reps]) => ({ exerciseId: name, name, kind, rir: 2, sets: reps.map((r) => ({ weight, reps: r })) })),
  };
}

const payload = (s: Session) => ({ token: 'secret', sessionId: s.id, rows: sessionToRows(s), sets: sessionToSetRows(s, targets), session: sessionSummaryRow(s) });

describe('Apps Script doPost', () => {
  let env: ReturnType<typeof makeEnv>;
  beforeEach(() => (env = makeEnv()));

  it('rejects a wrong token and writes nothing', () => {
    expect(env.post({ token: 'nope', sessionId: 'a', rows: [] })).toEqual({ ok: false, error: 'Bad token' });
    expect(env.sheets.get('Log')!.rows).toHaveLength(1);
  });

  it('explains what to do when no token was set up', () => {
    env.props.delete('SYNC_TOKEN');
    expect(env.post({ token: 'x', ping: true }).error).toContain('setup()');
  });

  it('answers a ping', () => {
    expect(env.post({ token: 'secret', ping: true })).toEqual({ ok: true, ping: true });
  });

  it('appends to Log, Sets and Sessions, with the Log columns unchanged', () => {
    const s = workout('s1', new Date(2026, 10, 14, 18, 0).getTime(), [['Lateral raise', 'weight', 5, [15, 14, 12]]]);
    expect(env.post(payload(s))).toEqual({ ok: true, appended: 1 });

    const log = env.sheets.get('Log')!.rows;
    expect(log).toHaveLength(2);
    expect(log[1]).toHaveLength(9);
    expect(Object.prototype.toString.call(log[1][0])).toBe('[object Date]');
    expect((log[1][0] as Date).getDate()).toBe(14);
    expect(log[1].slice(1)).toEqual(['Lateral raise', 5, 15, 14, 12, '', 2, 'Sat · Shoulders & arms']);

    const sets = env.sheets.get('Sets')!.rows;
    expect(sets[0][3]).toBe('Exercise');
    expect(sets).toHaveLength(1 + 3);
    expect(sets[1].slice(3, 8)).toEqual(['Lateral raise', 'weight', 1, 5, 15]);
    expect(env.sheets.get('Sessions')!.rows[1].slice(4)).toEqual([50, 1, 3, 5 * (15 + 14 + 12)]);
    expect(env.sheets.get('_sync')!.hidden).toBe(true);
  });

  it('does not write a session twice when the app retries', () => {
    const s = workout('s1', Date.now(), [['Lateral raise', 'weight', 5, [15, 14, 12]]]);
    env.post(payload(s));
    expect(env.post(payload(s))).toEqual({ ok: true, duplicate: true });
    expect(env.sheets.get('Log')!.rows).toHaveLength(2);
    expect(env.sheets.get('Sets')!.rows).toHaveLength(4);
  });

  it('still works for a payload without sets (older app version)', () => {
    const s = workout('s1', Date.now(), [['Lateral raise', 'weight', 5, [15, 14, 12]]]);
    expect(env.post({ token: 'secret', sessionId: s.id, rows: sessionToRows(s) })).toEqual({ ok: true, appended: 1 });
  });

  it('reports a summary failure without failing the sync', () => {
    env.ctx.rebuildSummaries_ = () => {
      throw new Error('boom');
    };
    const s = workout('s1', Date.now(), [['Lateral raise', 'weight', 5, [15]]]);
    const r = env.post(payload(s));
    expect(r.ok).toBe(true);
    expect(r.summaryError).toContain('boom');
    expect(env.sheets.get('Log')!.rows).toHaveLength(2);
  });

  it('builds the summary tabs from the synced sets', () => {
    const now = Date.now();
    env.post(payload(workout('a', now - 14 * DAY, [['Lateral raise', 'weight', 5, [12, 12, 11]], ['Assisted pull-up', 'assist', 35, [8, 7]], ['Hanging knee/leg raise', 'bodyweight', 0, [10, 10]]])));
    env.post(payload(workout('b', now - 7 * DAY, [['Lateral raise', 'weight', 5, [14, 13, 12]], ['Assisted pull-up', 'assist', 35, [10, 8]], ['Hanging knee/leg raise', 'bodyweight', 0, [12, 10]]])));
    const r = env.post(payload(workout('c', now, [['Lateral raise', 'weight', 6, [12, 12, 12]], ['Assisted pull-up', 'assist', 32.5, [7, 6]], ['Hanging knee/leg raise', 'bodyweight', 0, [12, 11]]])));
    expect(r).toEqual({ ok: true, appended: 3 });

    const progress = env.sheets.get('Progress')!;
    const lateral = progress.rows.find((x) => x[0] === 'Lateral raise')!;
    expect(lateral.slice(1, 3)).toEqual(['weight', 3]);
    expect(lateral[5]).toBe('5 × 12');
    expect(lateral[6]).toBe('6 × 12');
    expect(lateral[7]).toBe(6);
    expect(lateral[8]).toBe(7); // 5 × (1 + 12/30)
    expect(lateral[9]).toBe(8.4); // 6 × (1 + 12/30)
    expect(lateral[11]).toBe(20);
    const rowNo = progress.rows.indexOf(lateral) + 1;
    expect(progress.formulas.get(`${rowNo},13`)).toBe(`=SPARKLINE(N${rowNo}:P${rowNo})`);
    const pullup = progress.rows.find((x) => x[0] === 'Assisted pull-up')!;
    expect(pullup[7]).toBe(32.5); // least assist
    expect(pullup[8]).toBe(''); // no 1RM estimate for assisted work

    const prs = env.sheets.get('PRs')!.rows.slice(1).map((x) => x.slice(1, 5).join(' | '));
    expect(prs).toContain('Lateral raise | Weight | 6 kg | 5 kg');
    expect(prs).toContain('Lateral raise | Reps at 5 kg | 14 reps | 12 reps');
    expect(prs).toContain('Assisted pull-up | Less assist | 32.5 kg | 35 kg');
    expect(prs).toContain('Assisted pull-up | Reps at 35 kg | 10 reps | 8 reps');
    expect(prs).toContain('Hanging knee/leg raise | Reps | 12 reps | 10 reps');

    const weekly = env.sheets.get('Weekly')!.rows;
    const col = (name: string) => weekly[0].indexOf(name);
    expect(weekly[0].slice(0, 4)).toEqual(['Week of', 'Sessions', 'Sets', 'Volume (kg)']);
    expect(weekly[1].slice(1, 4)).toEqual([1, 7, 6 * 36]); // newest week first; volume counts weighted work only
    expect(weekly[1][col('Side delts')]).toBe(3);
    expect(weekly[1][col('Upper back / traps')]).toBe(1.5 + 1); // lateral raise 3 × 0.5 + pull-up 2 × 0.5
    expect(weekly[1][col('Lats')]).toBe(2);

    const dash = env.sheets.get('Dashboard')!.rows;
    const value = (label: string) => dash.find((x) => x[0] === label)![1];
    expect(value('Workouts logged')).toBe(3);
    expect(value('Sets logged')).toBe(21);
    expect(value('Workouts this week')).toBe(1);
    const side = dash.find((x) => x[0] === 'Side delts')!;
    expect(side.slice(1, 3)).toEqual([3, 3]); // this week, last week
  });

  it('setup creates a token once and the tabs', () => {
    env.props.delete('SYNC_TOKEN');
    const token = env.ctx.setup();
    expect(token.length).toBeGreaterThan(8);
    expect(env.ctx.setup()).toBe(token);
    expect([...env.sheets.keys()].sort()).toEqual(['Dashboard', 'Log', 'PRs', 'Progress', 'Sessions', 'Sets', 'Weekly', '_sync']);
    expect(env.sheets.get('Dashboard')!.rows.some((x) => String(x[0]).startsWith('No records yet'))).toBe(true);
  });
});
