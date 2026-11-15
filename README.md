# Gym Log

An offline-first workout logger that runs as an installable web app. It tracks sets with double progression, shows which muscles each exercise trains, and can back up to a Google Sheet you own. There is no account and no server: data lives in the browser's IndexedDB.

**Live app:** https://faytonn.github.io/gym-log/

## Features

- **Training days:** one button per day of the plan, with the next day in the rotation highlighted.
- **Fast set logging:** weight is typed on the numeric keypad and reps are picked by swiping a number strip. Both are prefilled from the previous session, so a repeat set is one tap.
- **Double progression hints:** each exercise shows the last session and what to aim for next (see below).
- **Rest timer:** starts when a set is saved, with separate defaults for compound and isolation lifts and an optional override per exercise.
- **Crash-safe sessions:** every change is written to IndexedDB immediately, so a workout survives the app closing or the phone locking.
- **Muscle maps:** a front and back body diagram per exercise, with primary and secondary muscles.
- **Weekly volume:** hard sets per muscle for the current week, planned and logged, as a heatmap and a sorted table.
- **History:** past sessions, per-exercise charts of working weight and best set, and CSV export.
- **Editable plan:** days and exercises can be added, removed, reordered and edited in Settings.
- **Google Sheets sync (optional):** finished sessions are queued locally and sent to an Apps Script web app. A failed sync never loses data.

## Progression logic

For each exercise the app reads the most recent session that included it. History is matched by exercise name, so an exercise that appears on several days has one shared history.

| Last session | Hint |
| --- | --- |
| Never logged | First session: find your weight |
| Lowest-rep set reached the top of the rep range | Add weight (smallest jump) |
| Any set below the top of the range | Same weight, +1 rep |
| Load type "assist", top of the range reached | Less assist |
| Load type "bodyweight", top of the range reached | Make it harder |

The weight jump is set per exercise. The logic is in [`src/progression.ts`](src/progression.ts).

## Weekly volume

A set counts as 1 for each primary muscle and 0.5 for each secondary muscle. The week starts on Monday. The heatmap uses four bands: 0–4, 5–9, 10–15 and 16+ sets. The calculation is in [`src/muscles.ts`](src/muscles.ts).

## Tech stack

- Vite, React, TypeScript
- Dexie (IndexedDB)
- `vite-plugin-pwa` (service worker and web app manifest)
- Vitest
- Google Apps Script for the optional sync endpoint

## Getting started

Requires Node 20.19 or newer.

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm test           # unit tests
npm run build      # production build in dist/
npm run preview    # serve the production build
```

The default training plan is defined in [`src/seed.ts`](src/seed.ts). It is only used on first run; after that the plan is edited in the app.

## Deployment

The app is a static site, so any static host works.

**GitHub Pages:** the workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) tests, builds and publishes on every push to `main`. In the repository settings, set **Pages → Source** to **GitHub Actions**. The workflow sets the base path to the repository name.

**Vercel or Netlify:** import the repository with the build command `npm run build` and the output directory `dist`.

When the app is not served from the domain root, set the `BASE` environment variable at build time, for example `BASE=/gym-log/`.

## Install on a phone

Open the deployed URL in Safari (iOS) or Chrome (Android) and choose **Add to Home Screen**. The app then opens full screen and works offline.

On iOS, a browser tab and the installed app have separate storage. Log from the installed app.

## Google Sheets sync

Sync is optional. It turns a Google Sheet into a training log. The script writes these tabs:

| Tab | Contents |
| --- | --- |
| `Log` | One row per exercise: `Date, Exercise, Weight (kg), Set 1, Set 2, Set 3, Set 4, Reps left in tank, Notes` |
| `Sets` | One row per set, with the exercise type and its primary and secondary muscles. This is the raw data for the tabs below. |
| `Sessions` | One row per workout: start time, duration, exercises, sets, volume |
| `Dashboard` | Totals, hard sets per muscle (this week, last week, 4-week average), latest records |
| `Progress` | One row per exercise: first and latest best set, best weight, estimated 1RM, change in percent, trend sparkline |
| `Weekly` | One row per week: workouts, sets, volume, weighted sets per muscle |
| `PRs` | Every personal record: weight, reps at a weight, estimated 1RM |

`Dashboard`, `Progress`, `Weekly` and `PRs` are rebuilt from `Sets` after every sync, so edits made by hand in those four tabs are overwritten. The estimated 1RM uses the Epley formula. The script creates every tab except `Log`.

Setup:

1. Create a Google Sheet with a tab named `Log` and the header row from the table above.
2. Open **Extensions → Apps Script** and replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
3. Select the function `setup` in the toolbar and click **Run**. Authorize the script when asked. It creates the tabs and a sync token, and prints the token in the execution log. To choose your own token instead, add a script property named `SYNC_TOKEN` under **Project Settings → Script Properties** first.
4. Choose **Deploy → New deployment**, type **Web app**, with **Execute as: Me** and **Who has access: Anyone**.
5. Copy the web app URL (it ends in `/exec`).
6. In the app, open **Settings → Google Sheets sync**, paste the URL and the token, and tap **Test connection**.

After a reload, the sheet has a **Gym Log** menu with **Rebuild summary tabs** and **Show sync token**.

How it behaves:

- A session is saved locally first and marked as synced only after the script confirms the write.
- Unsynced sessions stay in a queue and retry when the app opens, when the device comes back online, and every minute while the app is open. Automatic sync can be turned off in Settings.
- The script records each session ID in a hidden `_sync` tab, so a retry never writes duplicate rows.
- Requests without the correct token are rejected. The token is stored only on the device and in the script's properties.

To update the script later, use **Deploy → Manage deployments → Edit → New version**. This keeps the same URL.

## Platform limits on iOS

- Sound plays only after a user gesture, so the timer beep is unlocked when a set is saved. The silent switch mutes it.
- iOS Safari has no vibration API.
- Web apps are suspended while the screen is locked, so the beep cannot play then. The timer uses an absolute end time and is correct again on unlock. The app can keep the screen awake during a workout (Wake Lock API).

## Project layout

```
apps-script/Code.gs      Apps Script sync endpoint
scripts/make-icons.mjs   icon generator (npm run icons)
src/seed.ts              default training plan
src/progression.ts       double progression, history lookup, day rotation
src/muscles.ts           muscle list, default mapping, weekly volume
src/export.ts            sheet rows and CSV
src/sync.ts              sync queue
src/db.ts                IndexedDB storage
src/screens/             Home, Workout, Finished, History, Muscles, Settings
src/components/          ExerciseCard, BodyMap, RepWheel, WeightField, RestTimer, LineChart
```
