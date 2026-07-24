/** Lucide Trophy path data (24×24 viewBox). */
export const TROPHY_ICON_VIEW_SIZE = 24;

export const TROPHY_ICON_PATHS = [
  'M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978',
  'M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978',
  'M18 9h1.5a1 1 0 0 0 0-5H18',
  'M4 22h16',
  'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z',
  'M6 9H4.5a1 1 0 0 1 0-5H6',
] as const;

/** Inline Lucide Trophy SVG for HTML string contexts (map labels, popups). */
export function trophyIconHtml(sizePx = 10): string {
  const paths = TROPHY_ICON_PATHS.map((d) => `<path d="${d}"/>`).join('');
  return (
    `<svg class="ui-icon trophy-icon" xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" ` +
    `viewBox="0 0 ${TROPHY_ICON_VIEW_SIZE} ${TROPHY_ICON_VIEW_SIZE}" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    paths +
    `</svg>`
  );
}
