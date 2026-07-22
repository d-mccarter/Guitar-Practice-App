# Guitar Practice Tracker

A mobile-friendly web app for logging guitar practice sessions with **tempo as progressive overload** — similar to how weightlifters track increasing weight over time.

Works on iPhone: open in Safari, tap **Share → Add to Home Screen** for a full-screen app experience with local data storage.

## Features

- **Metronome** — Web Audio metronome with visual beat indicator
- **Practice items** — Configure routines by name (e.g. `5k`, `scales`, `warm-up`) with optional target tempo
- **Timed sessions** — Set duration and tempo; timer starts when the metronome starts
- **Session log** — Tracks time and tempo for every practice session
- **Manual logging** — Add past sessions from the Log tab without running the metronome
- **Progress charts** — Tempo over time and practice minutes by day, week, or month
- **Local storage** — All data saved in your browser (persists on iPhone when installed to home screen)

## Quick start (on your computer)

```bash
cd guitar-practice-tracker
npx --yes serve .
```

Then open `http://localhost:3000` in your browser.

## Use on iPhone (same Wi‑Fi network)

1. Find your computer's local IP (e.g. `192.168.1.42`)
2. Run the server bound to all interfaces:
   ```bash
   npx --yes serve . -l 3000
   ```
3. On iPhone Safari, go to `http://YOUR-IP:3000`
4. Tap **Share** → **Add to Home Screen**

Your practice data stays on your phone in local storage.

## How to use

1. **Items** — Add your book routines or exercises by name
2. **Practice** — Select an item, set timer length and tempo, tap **Start**
3. **Log** — Review past sessions, or tap **Log practice** to enter a session by hand
4. **Progress** — Pick an item to see tempo trends and weekly practice time

## Data

All data is stored in `localStorage` under the key `guitar-practice-tracker`. Nothing is sent to a server.

To back up your data, export from the browser console:

```javascript
copy(localStorage.getItem('guitar-practice-tracker'))
```

Paste the result into a text file to save. To restore:

```javascript
localStorage.setItem('guitar-practice-tracker', 'PASTE_JSON_HERE')
```

## Tech

Vanilla HTML, CSS, and JavaScript — no build step required.
