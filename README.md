# XC Task Review

A static web app for reviewing paragliding competition tasks and competitor tracklogs on a shared timeline.

**Live site:** [xctaskreview.github.io](https://xctaskreview.github.io)

## Features

- Load `.xctsk` or `.json` task files and `.igc` tracklogs (individual files or zip archives)
- **Map**
  - Turnpoint cylinders with optimized task route (FAI shortest-path through cylinders)
  - Live pilot positions with rank labels (`#1 Name`, etc.)
  - Optional pilot trails (configurable length in meters)
  - Task progress frontier marker showing the leading field’s max progress
  - Completed route legs and tagged turnpoints highlighted in green (start/SSS stays blue)
- **Leaderboard** overlay with task distance, lead %, altitude, speed, vario, and next turnpoint
- **Timeline** scrubber from first to last tracklog time, with task start and fastest-finish markers
- **Playback** at x1, x2, x5, x10, x20, x50, or x100 speed
- **Altitude vs task distance** chart with turnpoint lines, pilot positions, optional trails, and progress marker
- **Preferences** for distance, altitude, speed, and vertical-speed units; timezone; map type (topo, OSM, satellite); pilot trail length
- **Local session storage** — your loaded task, tracks, colors, and preferences are saved in the browser (IndexedDB) and restored on reload

## Usage

1. Open the app and load a task file (`.xctsk` or `.json`).
2. Add one or more IGC files, or a zip of IGC files.
3. Adjust preferences if needed (units, map type, pilot trails, etc.).
4. Click **Continue to review**.
5. Scrub the timeline or press Play to replay the race. Expand the **Leaderboard** on the map for live standings.

Your session is saved locally in the browser. Reloading the page restores the task and tracklogs without re-uploading.

## Development

Requires Node.js 22+ (matches the GitHub Actions workflow).

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build    # production build to dist/
npm run preview  # serve the production build locally
```

## Deployment

The site is deployed automatically to GitHub Pages when changes are pushed to the `main` branch (see `.github/workflows/deploy.yml`). The workflow builds with Vite and publishes the `dist/` output.

For a fork or local Pages setup, enable GitHub Pages from the repository’s **Settings → Pages** and use the **GitHub Actions** source.

## Data formats

- **XCTask** (`.xctsk`): JSON task definition used by XCTrack
- **IGC**: Standard GPS tracklog format with `B` records for fixes

Task progress is measured along the optimized route between turnpoint fixes, not center-to-center between turnpoints.

## Competition rules (FAI S7A / CIVL GAP)

This app is a **visual debrief tool**, not an official scorer. During review it applies **GAP-style** ideas where useful:

- Turnpoint **enter/exit** crossings (SSS direction from the task file; other cylinders default to enter)
- Separate **ESS** and **goal** cylinders when the task defines both
- **Start gate** assignment and **early start** hints when multiple gates or an early SSS exit are detected
- **Task deadline** from the task file caps stored progress after the deadline time
- Selected pilot **Task verification** panel: SSS / ESS / goal times, speed-section duration, crossing sequence, log warnings (e.g. fix interval)

Official task points, time points, lead coefficient, penalties, and airspace checks require **CIVL GAP** and an approved scorer such as [FS](http://fs.fai.org).

## Links

- **Repository:** [github.com/xctaskreview/xctaskreview.github.io](https://github.com/xctaskreview/xctaskreview.github.io)
- **Report an issue:** [github.com/xctaskreview/xctaskreview.github.io/issues/new](https://github.com/xctaskreview/xctaskreview.github.io/issues/new)
