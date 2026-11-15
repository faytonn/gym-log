import { describe, expect, it } from 'vitest';
import { demoSessions } from './demo';
import { isDemoUrl } from './mode';
import { exerciseKey, nextDayId } from './progression';
import { seedPlan } from './seed';
import { findRecords } from './stats';

const now = new Date(2026, 10, 15, 12, 0).getTime(); // Sunday noon
const plan = seedPlan();
const sessions = demoSessions(plan, now);

describe('isDemoUrl', () => {
  it('is on only with ?demo', () => {
    expect(isDemoUrl('?demo')).toBe(true);
    expect(isDemoUrl('?x=1&demo=1')).toBe(true);
    expect(isDemoUrl('')).toBe(false);
    expect(isDemoUrl('?demonstration')).toBe(false);
  });
});

describe('demoSessions', () => {
  it('covers eight weeks up to now, on the weekdays of the plan', () => {
    expect(sessions.length).toBeGreaterThan(30);
    expect(sessions.every((s) => s.finishedAt <= now)).toBe(true);
    const weekdays = new Set(sessions.map((s) => new Date(s.finishedAt).getDay()));
    expect([...weekdays].sort()).toEqual([1, 2, 4, 5, 6]);
    const firstDay = new Date(Math.min(...sessions.map((s) => s.finishedAt)));
    expect(firstDay >= new Date(2026, 8, 21)).toBe(true); // Monday seven weeks before this week's Monday (9 Nov)
    expect(firstDay < new Date(2026, 8, 28)).toBe(true);
  });

  it('includes this week, so the dashboard has something to show', () => {
    expect(sessions.filter((s) => s.finishedAt >= new Date(2026, 10, 9).getTime()).length).toBeGreaterThanOrEqual(3);
  });

  it('is the same on every run', () => {
    expect(demoSessions(plan, now)).toEqual(sessions);
  });

  it('logs every planned set and is never marked for syncing', () => {
    for (const s of sessions) {
      expect(s.synced).toBe(1);
      const day = plan.days.find((d) => d.id === s.dayId)!;
      expect(s.entries.map((e) => e.sets.length)).toEqual(day.exercises.map((e) => e.sets));
    }
  });

  it('keeps reps inside a sensible range', () => {
    for (const s of sessions)
      for (const e of s.entries) {
        const ex = plan.days.flatMap((d) => d.exercises).find((x) => exerciseKey(x.name) === exerciseKey(e.name))!;
        for (const set of e.sets) {
          expect(set.reps).toBeGreaterThanOrEqual(ex.repMin - 1);
          expect(set.reps).toBeLessThanOrEqual(ex.repMax);
        }
      }
  });

  it('progresses: weight never goes backwards, assist never goes up', () => {
    const byName = new Map<string, number[]>();
    for (const s of [...sessions].sort((a, b) => a.finishedAt - b.finishedAt))
      for (const e of s.entries) byName.set(e.name, [...(byName.get(e.name) ?? []), e.sets[0].weight]);
    const lateral = byName.get('Lateral raise')!;
    expect(lateral[lateral.length - 1]).toBeGreaterThan(lateral[0]);
    for (const [name, ws] of byName) {
      const kind = sessions.flatMap((s) => s.entries).find((e) => e.name === name)!.kind;
      for (let i = 1; i < ws.length; i++) {
        if (kind === 'assist') expect(ws[i]).toBeLessThanOrEqual(ws[i - 1]);
        else expect(ws[i]).toBeGreaterThanOrEqual(ws[i - 1]);
      }
    }
  });

  it('produces personal records and a next day in the rotation', () => {
    expect(findRecords(sessions).length).toBeGreaterThan(10);
    expect(nextDayId(plan.days.map((d) => d.id), sessions)).not.toBeNull();
  });
});
