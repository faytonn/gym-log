export type RestType = 'compound' | 'isolation';

/** How the logged weight should be read. */
export type LoadKind =
  | 'weight' // normal: more kg = harder
  | 'assist' // assisted machine: the number is the assist, less = harder
  | 'bodyweight'; // no external load (log 0); progress by making the move harder

export interface PlanExercise {
  id: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  /** Starting weight in kg, null when it has to be found in session 1. */
  startWeight: number | null;
  rest: RestType;
  /** Per-exercise rest override in seconds; null uses the default for the rest type. */
  restSeconds: number | null;
  kind: LoadKind;
  /** Smallest weight jump available for this exercise, in kg. Also the stepper step. */
  increment: number;
  note: string;
}

export interface PlanDay {
  id: string;
  /** Short label, e.g. "Mon". */
  label: string;
  name: string;
  exercises: PlanExercise[];
}

export interface Plan {
  days: PlanDay[];
}

export interface LoggedSet {
  weight: number;
  reps: number;
}

export interface SessionEntry {
  exerciseId: string;
  name: string;
  kind: LoadKind;
  sets: LoggedSet[];
  /** Reps left in tank (0-5), null if not recorded. */
  rir: number | null;
}

export interface Session {
  id: string;
  dayId: string;
  dayLabel: string;
  dayName: string;
  startedAt: number;
  finishedAt: number;
  entries: SessionEntry[];
  /** 0 = waiting to be synced to Google Sheets, 1 = synced. Numeric so Dexie can index it. */
  synced: 0 | 1;
  syncedAt?: number;
  lastSyncError?: string;
}

/** Draft state for one exercise during a live workout. */
export interface ActiveEntry {
  sets: LoggedSet[];
  weight: number;
  reps: number;
  rir: number | null;
}

export interface ActiveSession {
  id: string;
  dayId: string;
  startedAt: number;
  entries: Record<string, ActiveEntry>;
  restEndsAt: number | null;
  restTotal: number;
}

export interface Settings {
  syncUrl: string;
  syncToken: string;
  compoundRest: number;
  isolationRest: number;
  sound: boolean;
  keepAwake: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  syncUrl: '',
  syncToken: '',
  compoundRest: 150,
  isolationRest: 75,
  sound: true,
  keepAwake: true,
};
