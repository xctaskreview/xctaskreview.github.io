const REVIEW_WALKTHROUGH_DISMISSED_KEY = 'xc-task-review-walkthrough-dismissed';

export type ReviewWalkthroughStepId =
  | 'app-home'
  | 'time-controls'
  | 'back-to-task'
  | 'map-legend'
  | 'map-interactions'
  | 'leaderboard'
  | 'leg-statistics'
  | 'pilot-select'
  | 'pilot-stats'
  | 'task-progress';

export interface ReviewWalkthroughStep {
  id: ReviewWalkthroughStepId;
  target: string;
  title: string;
  body: string;
}

export const REVIEW_WALKTHROUGH_STEPS: ReviewWalkthroughStep[] = [
  {
    id: 'app-home',
    target: '[data-walkthrough="app-home"]',
    title: 'App menu',
    body: 'Tap the XC Task Review icon to open settings (units, map type, pilot trails, circling detection) and project links. You can restart this walkthrough anytime from Walkthrough in the app menu.',
  },
  {
    id: 'time-controls',
    target: '[data-walkthrough="time-controls"]',
    title: 'Time controls',
    body: 'Play or pause the replay, change playback speed, and scrub the timeline. The clock shows GPS time and elapsed task time. Arrow keys step 30 seconds; Shift+arrow jumps between start and turnpoint markers. Click Start, turnpoint, or fastest-finish markers on the slider to jump to those moments.',
  },
  {
    id: 'back-to-task',
    target: '[data-walkthrough="back-to-task"]',
    title: 'Back to task setup',
    body: 'Use the back arrow to return to the welcome screen—change the task file, add or remove tracklogs, edit turnpoints, or import from CIVL or XContest before continuing review again.',
  },
  {
    id: 'map-legend',
    target: '[data-walkthrough="map-legend"]',
    title: 'Map legend',
    body: 'Open the legend to see what colors and line styles mean—turnpoints, planned legs, pilot trails, landing tracks, and the leader’s task progress line.',
  },
  {
    id: 'map-interactions',
    target: '[data-walkthrough="map-interactions"]',
    title: 'Map',
    body: 'Pan and zoom the map. Click turnpoint markers or dashed route legs for details. Click a pilot marker to highlight that pilot’s progress along the task on the map.',
  },
  {
    id: 'leaderboard',
    target: '[data-walkthrough="leaderboard"]',
    title: 'Leaderboard',
    body: 'Live ranking at the current replay time. Expand to show or hide pilots on the map and change their colors.',
  },
  {
    id: 'leg-statistics',
    target: '[data-walkthrough="leg-statistics"]',
    title: 'Leg stats',
    body: 'Expand to compare each task leg across the field—distances, fastest times, and speeds for every pilot who completed the leg.',
  },
  {
    id: 'pilot-select',
    target: '[data-walkthrough="pilot-select"]',
    title: 'Select a pilot',
    body: 'Click a pilot on the map or tap their row in the leaderboard to focus them. We picked one for you here—you can switch pilots anytime the same way.',
  },
  {
    id: 'pilot-stats',
    target: '[data-walkthrough="pilot-detail-panel"]',
    title: 'Pilot stats',
    body: 'The pilot tab and panel show detailed metrics for the selected pilot—task progress, altitude, speed, vario, glide, SSS timing, and distance behind the leader.',
  },
  {
    id: 'task-progress',
    target: '[data-walkthrough="task-progress"]',
    title: 'Task progress graph',
    body: 'Altitude versus distance for the fleet at the current time. Click the chart to seek playback, scroll to zoom the distance axis, and drag to pan when zoomed. Minimize or resize the panel using the header controls.',
  },
];

export function isReviewWalkthroughDismissed(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(REVIEW_WALKTHROUGH_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markReviewWalkthroughDismissed(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(REVIEW_WALKTHROUGH_DISMISSED_KEY, '1');
  } catch {
    // ignore
  }
}

export function clearReviewWalkthroughDismissed(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(REVIEW_WALKTHROUGH_DISMISSED_KEY);
  } catch {
    // ignore
  }
}
