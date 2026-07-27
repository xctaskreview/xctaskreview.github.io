import type { LeaderboardMetricKey } from './leaderboardMetrics';

export type MapMetricIconKey = LeaderboardMetricKey;

const LUCIDE_INNER: Record<MapMetricIconKey, string> = {
  task: '<circle cx="6" cy="19" r="3"></circle><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path><circle cx="18" cy="5" r="3"></circle>',
  lead: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"></path><path d="M5 21h14"></path>',
  alt: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"></path>',
  speed: '<path d="m12 14 4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path>',
  vario:
    '<path d="M16 7h6v6"></path><path d="m22 7-8.5 8.5-5-5L2 17"></path>',
  nextTp:
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path><circle cx="12" cy="10" r="3"></circle>',
  glide:
    '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path>',
};

export function metricIconHtml(metric: MapMetricIconKey, sizePx = 14): string {
  return (
    `<svg class="ui-icon metric-icon" xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${LUCIDE_INNER[metric]}</svg>`
  );
}

/** Circular arrow for circling on map pilot tags (distinct from the vario trend icon). */
export function mapCirclingIconHtml(sizePx = 14): string {
  const inner =
    '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>' +
    '<path d="M21 3v5h-5"></path>';
  return (
    `<svg class="ui-icon metric-icon map-circling-icon" xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
  );
}

function lucideMetricIconHtml(metric: LeaderboardMetricKey, sizePx = 14): string {
  return metricIconHtml(metric, sizePx);
}

export function metricLabelHtml(metric: LeaderboardMetricKey, label: string): string {
  const safe =
    label
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;') ?? '';
  return (
    `<span class="metric-label">${lucideMetricIconHtml(metric)}` + `<span>${safe}</span></span>`
  );
}

export function metricDtHtml(metric: LeaderboardMetricKey, label: string): string {
  return `<dt>${metricLabelHtml(metric, label)}</dt>`;
}
