# XC Task Review

A static web app for reviewing paragliding competition tasks and competitor tracklogs. Deployable to GitHub Pages.

## Features

- Load `.xctsk` task files and `.igc` tracklogs (individual files or zip archives)
- Map view with turnpoint cylinders and optimized task route
- Timeline scrubber from first to last tracklog time, with task start and fastest finish markers
- Play/pause replay with speed controls (x1, x2, x4, x8, x16)
- Altitude vs task progress chart showing each competitor's current position

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The production build is written to `dist/`. For GitHub Pages on `xctaskreview.github.io`, publish the contents of `dist/` to the repository root or configure Pages to serve from `/docs` or the `gh-pages` branch.

## Usage

1. Load a task file (`.xctsk`)
2. Load one or more IGC files, or a zip of IGC files
3. Scrub the timeline or press Play to animate competitor positions
4. Review altitude and task progress in the chart below the map

## Data formats

- **XCTask**: JSON task definition used by XCTrack
- **IGC**: Standard GPS tracklog format with `B` records for fixes

The optimized route uses the FAI iterative shortest-path algorithm through turnpoint cylinders.
