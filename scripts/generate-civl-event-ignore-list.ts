/**
 * Find CIVL events with no importable tasks (Overall results + IGC zip) and merge into ignore list.
 * Run: npx tsx scripts/generate-civl-event-ignore-list.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DELAY_MS = 250;
const OUTPUT = join(process.cwd(), 'src/data/importTaskIgnoreList.json');
const CIVL_BASE = 'https://civlcomps.org';

interface TaskIgnoreEntry {
  source: string;
  taskResultUrl: string;
}

interface EventIgnoreEntry {
  source: 'civl';
  resultsUrl: string;
  eventLink: string;
  label: string;
  context: string;
  found: string;
  missing: string;
}

interface IgnoreListFile {
  tasks: TaskIgnoreEntry[];
  events: EventIgnoreEntry[];
}

function normalizeTaskUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeEventResultsUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function loadExistingIgnoreList(): IgnoreListFile {
  const raw = JSON.parse(readFileSync(OUTPUT, 'utf8')) as IgnoreListFile | TaskIgnoreEntry[];
  if (Array.isArray(raw)) {
    return { tasks: raw as TaskIgnoreEntry[], events: [] };
  }
  return { tasks: raw.tasks ?? [], events: (raw.events ?? []) as EventIgnoreEntry[] };
}

function writeIgnoreList(tasks: TaskIgnoreEntry[], events: EventIgnoreEntry[]): void {
  writeFileSync(OUTPUT, `${JSON.stringify({ tasks, events }, null, 2)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url.startsWith('http') ? url : `${CIVL_BASE}${url}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url: string): Promise<{
  events?: Array<{
    eventLink: string;
    eventTitle: string;
    cityTitle: string;
    countryTitle: string;
    participantsCount: number | string;
  }>;
  totalCount?: number;
  loadedCount?: number;
  pagesCount?: number;
}> {
  const response = await fetch(`${CIVL_BASE}${url}`, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function parseYears(html: string): Array<{ year: number; label: string; pastRange: string }> {
  const years: Array<{ year: number; label: string; pastRange: string }> = [];
  const inputRe = /<input[^>]*class="[^"]*jsPastDate[^"]*"[^>]*>/gi;

  for (const tag of html.match(inputRe) ?? []) {
    const pastRange =
      tag.match(/\bvalue="([^"]+)"/)?.[1] ?? tag.match(/\bdata-value="([^"]+)"/)?.[1] ?? '';
    const title = tag.match(/\bdata-title="([^"]+)"/)?.[1]?.trim() ?? '';
    const label = title || pastRange;
    const yearMatch = title.match(/(\d{4})/) ?? pastRange.match(/^(\d{4})/);
    if (!yearMatch || !pastRange) continue;
    years.push({ year: Number(yearMatch[1]), label, pastRange });
  }

  return years.sort((a, b) => b.year - a.year);
}

function resolveCivlUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${CIVL_BASE}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

function countImportableTasks(html: string, ignoredTasks: Set<string>): number {
  const tableMatch = html.match(
    /<table[^>]*class="[^"]*task-list[^"]*"[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i,
  );
  if (!tableMatch) return 0;

  let count = 0;
  for (const row of tableMatch[1].split(/<tr\b/i).slice(1)) {
    const overallMatch = row.match(
      /<a[^>]*class="[^"]*link-task[^"]*"[^>]*href="([^"]+)"[^>]*>\s*Overall\s*<\/a>/i,
    );
    if (!overallMatch) continue;

    const dateTaskMatch = row.match(/<div[^>]*class="[^"]*date-task[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const dateTaskHtml = dateTaskMatch?.[1] ?? row;
    const hasIgcZip =
      /<a[^>]*href="[^"]+\.zip[^"]*"[^>]*>\s*IGC\s*<\/a>/i.test(dateTaskHtml) ||
      (/download-file\?filename=[^"]+\.zip/i.test(dateTaskHtml) &&
        />\s*IGC\s*</i.test(dateTaskHtml));

    if (!hasIgcZip) continue;

    const taskResultUrl = resolveCivlUrl(overallMatch[1]);
    if (ignoredTasks.has(normalizeTaskUrl(taskResultUrl))) continue;
    count += 1;
  }

  return count;
}

async function fetchEventsForYear(pastRange: string): Promise<
  Array<{ eventLink: string; resultsUrl: string; label: string; context: string }>
> {
  const events: Array<{ eventLink: string; resultsUrl: string; label: string; context: string }> = [];
  let page = 0;
  let loadedCount = 0;
  let totalCount = 0;

  while (true) {
    const params = new URLSearchParams({
      'search[mode]': 'list',
      'search[dates]': 'past',
      'search[past]': pastRange,
      'search[page]': String(page),
    });
    const response = await fetchJson(`/events?${params.toString()}`);
    const batch = response.events ?? [];

    for (const event of batch) {
      const participants = event.participantsCount;
      if (participants === '' || participants === null || participants === undefined) continue;
      const eventLink = resolveCivlUrl(event.eventLink);
      const resultsUrl = `${eventLink.replace(/\/$/, '')}/results`;
      events.push({
        eventLink,
        resultsUrl,
        label: `${event.eventTitle} · ${event.cityTitle}, ${event.countryTitle}`,
        context: pastRange,
      });
    }

    loadedCount += response.loadedCount ?? batch.length;
    totalCount = response.totalCount ?? loadedCount;
    const pagesCount = response.pagesCount ?? 0;
    if (totalCount <= loadedCount || pagesCount <= page + 1 || batch.length === 0) break;
    page += 1;
    await sleep(DELAY_MS);
  }

  return events;
}

async function main(): Promise<void> {
  const existing = loadExistingIgnoreList();
  const ignoredTasks = new Set(existing.tasks.map((entry) => normalizeTaskUrl(entry.taskResultUrl)));

  const yearsHtml = await fetchText('/events');
  const years = parseYears(yearsHtml);
  const skipUntil = process.env.CIVL_SKIP_UNTIL_YEAR
    ? Number(process.env.CIVL_SKIP_UNTIL_YEAR)
    : null;

  const eventIgnores: EventIgnoreEntry[] = [...(existing.events as EventIgnoreEntry[])];
  const seenResults = new Set(eventIgnores.map((entry) => normalizeEventResultsUrl(entry.resultsUrl)));

  for (const year of years) {
    if (skipUntil !== null && year.year > skipUntil) {
      console.log(`Skipping ${year.label} (CIVL_SKIP_UNTIL_YEAR=${skipUntil})`);
      continue;
    }

    console.log(`Scanning ${year.label}…`);
    const events = await fetchEventsForYear(year.pastRange);

    for (const event of events) {
      const normalizedResults = normalizeEventResultsUrl(event.resultsUrl);
      if (seenResults.has(normalizedResults)) continue;
      seenResults.add(normalizedResults);

      await sleep(DELAY_MS);
      let html: string;
      try {
        html = await fetchText(event.resultsUrl);
      } catch (error) {
        eventIgnores.push({
          source: 'civl',
          resultsUrl: event.resultsUrl,
          eventLink: event.eventLink,
          label: event.label,
          context: year.label,
          found: 'Event listed on CIVL Comps with published results.',
          missing: `Could not load results page (${error instanceof Error ? error.message : 'unknown'}).`,
        });
        continue;
      }

      const importableTasks = countImportableTasks(html, ignoredTasks);
      if (importableTasks === 0) {
        eventIgnores.push({
          source: 'civl',
          resultsUrl: event.resultsUrl,
          eventLink: event.eventLink,
          label: event.label,
          context: year.label,
          found: 'Event with results on CIVL Comps (participants and results page).',
          missing:
            'No importable tasks: each task needs an Overall results link, an IGC zip, and a parseable task page not on the task ignore list.',
        });
      }
    }

    eventIgnores.sort((a, b) => a.resultsUrl.localeCompare(b.resultsUrl));
    writeIgnoreList(existing.tasks, eventIgnores);
    console.log(`  Saved ${eventIgnores.length} event ignore entries after ${year.label}.`);
  }

  console.log(`Done: ${eventIgnores.length} CIVL event ignore entries (${existing.tasks.length} task entries kept).`);
}

void main();
