# Gym Log

A mobile-first PWA for logging gym workouts on an iPhone. It works offline, keeps all data on the phone (IndexedDB), and can sync finished workouts to your own Google Sheet through a Google Apps Script web app. There is no login, no account and no backend apart from that script.

- **Home:** one big button per training day. The next day in your rotation is highlighted.
- **Workout:** each exercise shows its sets × rep range, form note, what you did last time, and a double-progression hint. Weight and reps use big −/+ steppers that are prefilled, so logging a set is usually one tap. You can tap a number to type an exact value. A "reps left in tank" picker (0–5) is on each card.
- **Rest timer:** starts when you save a set. Defaults are 2:30 for compound lifts and 1:15 for isolation lifts, and each exercise can override them. It beeps when rest is over (see the iPhone notes below).
- **Crash-safe:** every tap is saved to IndexedDB at once. Closing the app or locking the phone mid-workout loses nothing, and the app reopens on the workout.
- **History:** past sessions, plus per-exercise charts of working weight and best set over time. "Download CSV" exports a backup.
- **Settings:** add, remove, reorder and edit exercises and days. Set rest times and Google Sheets sync.

## Progression logic (double progression)

For each exercise the app looks at your most recent logged session of that exercise on any day. History is shared by exercise name, so "Lateral raise" on Mon, Tue and Sat is one history and "Leg curl" is shared between Tue and Fri.

| Last session | Hint |
| --- | --- |
| Never logged | **First session: find your weight** |
| Lowest-rep set reached the top of the rep range | **Add weight (smallest jump)**, showing the target weight (last weight + the exercise's weight step) |
| Otherwise | **Same weight, +1 rep**, showing which set to beat |
| Assisted pull-up (load type "assist") at the top | **Less assist**, which lowers the number |
| Hanging knee/leg raise (load type "bodyweight") at the top | **Make it harder (straighter legs)** |

The weight field is prefilled with last session's weight. When the hint suggests a new weight, a **Use X** button applies it with one tap. The logic is in `src/progression.ts`, with unit tests in `src/progression.test.ts`.

## Run locally

Requires Node 20.19+ (Node 22 or 24 recommended).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (progression, CSV/sheet rows, sync queue)
npm run build      # production build in dist/
npm run preview    # serve the production build (service worker active)
```

To try it on your phone over Wi-Fi, run `npm run dev -- --host` and open the printed network URL in Safari. Offline mode and "Add to Home Screen" need HTTPS, so use a deployed URL for the real install.

## Deploy (free)

### Option A: GitHub Pages

1. Create a GitHub repository (for example `gym-log`) and push this project to its `main` branch:
   ```bash
   git remote add origin https://github.com/<you>/gym-log.git
   git push -u origin main
   ```
2. On GitHub, open **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the tests, builds with the correct base path (`/<repo-name>/`) and publishes. Your app is then at `https://<you>.github.io/gym-log/`.

Every push to `main` redeploys. The installed app picks up the new version the next time you open it.

### Option B: Vercel

1. Push the project to GitHub (step 1 above).
2. On [vercel.com](https://vercel.com), choose **Add New → Project**, import the repository and keep the detected settings (framework: Vite, build command `npm run build`, output directory `dist`).
3. Deploy. Your app is at `https://<project>.vercel.app`.

## Add it to your iPhone home screen

1. Open the deployed URL in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Start the app from the new icon. It opens full screen like a native app and works offline after the first load.

> Note: data logged in a normal Safari tab and data in the home-screen app are stored separately on iOS. Install first, then always log from the icon.

## Google Sheets sync

The app sends finished workouts to a Google Apps Script web app bound to your **Workout Log** sheet. The script appends rows to the **Log** tab:

`Date | Exercise | Weight (kg) | Set 1 | Set 2 | Set 3 | Set 4 | Reps left in tank | Notes`

One row is written per exercise. Notes holds the day (for example `Mon · Upper A`). It also records when the weight is an assist and when sets used different weights.

### 1. Add the script to your sheet

1. Open the **Workout Log** spreadsheet in Google Sheets. Check that it has a tab named exactly `Log` with the header row above.
2. Go to **Extensions → Apps Script**. A script project bound to the sheet opens.
3. Delete everything in `Code.gs` and paste the contents of [`apps-script/Code.gs`](apps-script/Code.gs). Click **Save** (disk icon).

### 2. Set the secret token

1. Make up a long random string. You can generate one with `node -e "console.log(crypto.randomUUID())"` or use a password manager.
2. In the Apps Script editor, click **Project Settings** (gear icon on the left).
3. Scroll to **Script Properties** and click **Add script property**. Set **Property** to `SYNC_TOKEN` and **Value** to your random string. Click **Save script properties**.

### 3. Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Click the gear next to **Select type** and choose **Web app**.
3. Set **Execute as** to **Me** and **Who has access** to **Anyone**. The token is what protects it: requests without the right token are rejected.
4. Click **Deploy**. When Google asks, click **Authorize access** and choose your account. If it shows "Google hasn't verified this app", click **Advanced → Go to (project name) (unsafe)**, then **Allow**. This warning appears because it is your own unpublished script.
5. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy.../exec`.
6. Optional check: open that URL in a browser. You should see `{"ok":true,"service":"gym-log-sync"}`.

### 4. Connect the app

1. In the app, open **Settings → Google Sheets sync**.
2. Paste the web app URL and the token.
3. Tap **Test connection**. It should say "✓ Connected".

### How sync behaves

- A finished workout is **saved on the phone first**, then synced. Sync failures never delete anything.
- Unsynced workouts wait in a queue, shown as "Queued" in History and as a counter on Home. With **Sync automatically when online** on, they retry when the app opens, when the phone comes back online, and every minute while the app is open. With it off, they sync only when you tap **Sync now**.
- A workout is marked synced only after the script confirms it wrote the rows. The script records each workout ID in a hidden `_sync` tab. If a retry sends the same workout again, it does not duplicate rows.
- **Download CSV** in History exports everything in the same columns as the sheet. On iPhone it opens the share sheet, where you can choose **Save to Files**.

### Updating the script later

Use **Deploy → Manage deployments**, click the pencil, set **Version** to **New version**, then click **Deploy**. This keeps the same URL. A **New deployment** would create a new URL that you would have to paste into the app again.

## iPhone notes and limits

- **Beep:** iOS allows sound only after a tap, so the app unlocks audio when you tap **Save set**. The silent switch can mute it.
- **Vibration:** iOS Safari does not support web vibration, so the app vibrates only on Android.
- **Screen lock:** iOS pauses web apps while the screen is locked, so no beep plays while it is locked. The timer uses an absolute end time, so it shows the right time when you unlock. Keep **Keep screen on during workout** enabled (it uses the Wake Lock API, iOS 18.4+ for home-screen apps) if you want the beep.
- **Storage:** the app asks the browser for persistent storage. iOS does not apply its 7-day storage cleanup to home-screen apps. For safety, keep Sheets sync on or export a CSV now and then.

## Project layout

```
apps-script/Code.gs        Google Apps Script endpoint (doPost / doGet)
scripts/make-icons.mjs     generates the PWA and iOS icons (npm run icons)
src/seed.ts                default training plan (editable in Settings)
src/progression.ts         double progression, history lookup, day rotation
src/export.ts              sheet rows and CSV
src/sync.ts                sync queue to Apps Script
src/db.ts                  IndexedDB (Dexie): sessions, plan, settings, workout in progress
src/screens/               Home, Workout, Finished, History, Settings
src/components/            ExerciseCard, Stepper, RestTimer, LineChart, TextField
```
