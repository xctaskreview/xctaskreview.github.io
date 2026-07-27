/**
 * Scan XCDemon archived leagues (all seasons) for broken task result pages.
 * Run: npx tsx scripts/generate-import-ignore-list.ts
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';

const DELAY_MS = 300;
const OUTPUT = join(process.cwd(), 'src/data/importTaskIgnoreList.json');
const XCDEMON_BASE = 'https://xcdemon.com';

interface IgnoreEntry {
  source: 'xcdemon' | 'civl';
  taskResultUrl: string;
  label?: string;
  context?: string;
  found: string;
  missing: string;
}

function setupDom(): Document {
  const window = new Window({ url: 'https://xcdemon.com/' });
  (globalThis as typeof globalThis & { DOMParser: typeof DOMParser }).DOMParser = window.DOMParser;
  return window.document;
}

function normalizeImportTaskUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function isXcdemonTaskResultUnavailable(html: string): boolean {
  return /task result not found|Something went wrong while loading the task result/i.test(html);
}

const DATE_RANGE_RE = /^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/;

function parseArchivedSeasons(html: string): Array<{ leagueId: number; leagueName: string; year: number }> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const h1 = [...doc.querySelectorAll('h1')].find((el) => el.textContent?.trim() === 'All Leagues');
  if (!h1) return [];

  let list: Element | null = h1.nextElementSibling;
  while (list && list.tagName !== 'UL') list = list.nextElementSibling;
  if (!list) return [];

  const seasons: Array<{ leagueId: number; leagueName: string; year: number }> = [];
  const children = [...list.children];

  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (child.tagName !== 'LI') continue;
    const link = child.querySelector('a[href*="leagueappid="]');
    if (!link) continue;
    const href = link.getAttribute('href') ?? '';
    const idMatch = href.match(/[?&]leagueappid=(\d+)/);
    const leagueId = idMatch ? Number(idMatch[1]) : 0;
    const leagueName = link.textContent?.trim() ?? '';
    if (!leagueId || !leagueName) continue;

    const datesList = children[index + 1];
    if (!datesList || datesList.tagName !== 'UL') continue;
    for (const dateItem of datesList.querySelectorAll(':scope > li')) {
      const text = dateItem.textContent?.trim() ?? '';
      const match = text.match(DATE_RANGE_RE);
      if (!match) continue;
      seasons.push({ leagueId, leagueName, year: Number(match[1].slice(0, 4)) });
    }
  }

  return seasons;
}

function resolveXcdemonUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${XCDEMON_BASE}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

function parseResultsTasks(
  html: string,
  leagueId: number,
): Array<{
  taskResultUrl: string;
  igcZipUrl: string | null;
  label: string;
}> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tasks: Array<{ taskResultUrl: string; igcZipUrl: string | null; label: string }> = [];

  for (const row of doc.querySelectorAll('#myTable tr')) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) continue;
    const location = cells[0].textContent?.trim() ?? '';
    const date = cells[1].textContent?.trim() ?? '';
    if (!location || !date || location.toUpperCase() === 'OVERALL') continue;

    let taskResultUrl: string | null = null;
    for (const link of cells[3].querySelectorAll('a[href]')) {
      const href = link.getAttribute('href') ?? '';
      const modern = href.match(/results_task\.php(?:\?|.*?&)(?:.*?&)?task_id=(\d+)/i);
      if (modern) {
        taskResultUrl = resolveXcdemonUrl(href);
        break;
      }
      const legacy = href.match(/task_result_(\d+)\.html/i);
      if (legacy) {
        taskResultUrl = resolveXcdemonUrl(href);
        break;
      }
    }
    if (!taskResultUrl) continue;

    let igcZipUrl: string | null = null;
    for (const link of cells[4].querySelectorAll('a[href]')) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const label = link.textContent?.trim().toUpperCase() ?? '';
      if (label === 'IGC' || /-igcs\.zip/i.test(href)) {
        igcZipUrl = resolveXcdemonUrl(href);
        break;
      }
    }

    tasks.push({ taskResultUrl, igcZipUrl, label: `${date} · ${location}` });
  }

  return tasks;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  setupDom();
  const seen = new Set<string>();
  const entries: IgnoreEntry[] = [];

  const archivedHtml = await fetchText(`${XCDEMON_BASE}/index.php?leagueappid=41&id=archived_leagues`);
  const seasons = parseArchivedSeasons(archivedHtml);
  const byLeague = new Map<number, typeof seasons>();
  for (const season of seasons) {
    const list = byLeague.get(season.leagueId) ?? [];
    list.push(season);
    byLeague.set(season.leagueId, list);
  }

  let probed = 0;
  for (const [leagueId, leagueSeasons] of byLeague) {
    const leagueName = leagueSeasons[0]?.leagueName ?? String(leagueId);
    const years = [...new Set(leagueSeasons.map((season) => season.year))].sort((a, b) => b - a);

    for (const year of years) {
      await sleep(DELAY_MS);
      let resultsHtml: string;
      try {
        resultsHtml = await fetchText(
          `${XCDEMON_BASE}/index.php?leagueappid=${leagueId}&id=results&year=${year}`,
        );
      } catch {
        continue;
      }

      for (const task of parseResultsTasks(resultsHtml, leagueId)) {
        const normalized = normalizeImportTaskUrl(task.taskResultUrl);
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        await sleep(DELAY_MS);
        probed += 1;
        if (probed % 25 === 0) {
          console.log(`Probed ${probed} task pages, ${entries.length} broken so far…`);
        }

        let taskHtml: string;
        try {
          taskHtml = await fetchText(task.taskResultUrl);
        } catch (error) {
          entries.push({
            source: 'xcdemon',
            taskResultUrl: task.taskResultUrl,
            label: task.label,
            context: `${leagueName} · ${year}`,
            found: 'Task listed on league results page with TASK RESULTS link.',
            missing: `Could not download task page (${error instanceof Error ? error.message : 'unknown'}).`,
          });
          continue;
        }

        if (isXcdemonTaskResultUnavailable(taskHtml)) {
          entries.push({
            source: 'xcdemon',
            taskResultUrl: task.taskResultUrl,
            label: task.label,
            context: `${leagueName} · ${year}`,
            found: task.igcZipUrl
              ? 'Results row with TASK RESULTS link and IGC zip on the league page.'
              : 'Results row with TASK RESULTS link (no IGC zip on league page).',
            missing:
              'Server-side task result XML/HTML (page returns “task result not found” instead of a turnpoint table).',
          });
        }
      }
    }
  }

  entries.sort((a, b) => a.taskResultUrl.localeCompare(b.taskResultUrl));

  let existingEvents: unknown[] = [];
  try {
    const raw = JSON.parse(readFileSync(OUTPUT, 'utf8')) as { events?: unknown[] } | IgnoreEntry[];
    if (!Array.isArray(raw) && raw.events) {
      existingEvents = raw.events;
    }
  } catch {
    // fresh file
  }

  writeFileSync(
    OUTPUT,
    `${JSON.stringify({ tasks: entries, events: existingEvents }, null, 2)}\n`,
  );
  console.log(`Wrote ${entries.length} task ignore entries (${probed} task pages probed).`);
}

void main();
