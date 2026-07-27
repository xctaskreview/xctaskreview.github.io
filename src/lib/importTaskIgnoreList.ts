import ignoreListData from '../data/importTaskIgnoreList.json';

export interface ImportTaskIgnoreEntry {
  source: 'xcdemon' | 'civl';
  taskResultUrl: string;
  label?: string;
  context?: string;
  found: string;
  missing: string;
}

export interface ImportEventIgnoreEntry {
  source: 'civl';
  resultsUrl: string;
  eventLink?: string;
  label?: string;
  context?: string;
  found: string;
  missing: string;
}

export interface ImportIgnoreListFile {
  tasks: ImportTaskIgnoreEntry[];
  events: ImportEventIgnoreEntry[];
}

function loadIgnoreListFile(): ImportIgnoreListFile {
  const raw = ignoreListData as ImportIgnoreListFile | ImportTaskIgnoreEntry[];
  if (Array.isArray(raw)) {
    return { tasks: raw, events: [] };
  }
  return {
    tasks: raw.tasks ?? [],
    events: raw.events ?? [],
  };
}

const { tasks: taskEntries, events: eventEntries } = loadIgnoreListFile();

const ignoredTaskUrls = new Set(taskEntries.map((entry) => normalizeImportTaskUrl(entry.taskResultUrl)));
for (const entry of taskEntries) {
  if (entry.source !== 'xcdemon') continue;
  const key = xcdemonTaskCatalogKey(entry.taskResultUrl);
  if (!key) continue;
  const [leagueId, taskId] = key.split(':');
  // League 31 (X Red Rocks): results_task.php probes fail but legacy task_result pages work.
  if (leagueId === '31') continue;
  ignoredTaskUrls.add(
    normalizeImportTaskUrl(
      `https://xcdemon.com/task_result_${taskId}.html?leagueappid=${leagueId}`,
    ),
  );
}
const ignoredEventResultsUrls = new Set(
  eventEntries.map((entry) => normalizeImportEventUrl(entry.resultsUrl)),
);

function xcdemonTaskCatalogKey(taskResultUrl: string): string | null {
  const taskId = extractXcdemonTaskId(taskResultUrl);
  if (!taskId) return null;
  const normalized = normalizeImportTaskUrl(taskResultUrl);
  try {
    const parsed = new URL(normalized);
    const leagueId = parsed.searchParams.get('leagueappid');
    if (leagueId) return `${leagueId}:${taskId}`;
  } catch {
    // fall through
  }
  const queryLeague = normalized.match(/[?&]leagueappid=(\d+)/i)?.[1];
  if (queryLeague) return `${queryLeague}:${taskId}`;
  return null;
}

/** Task id from XCDemon `results_task.php` or legacy `task_result_N.html` links. */
export function extractXcdemonTaskId(taskResultUrl: string): string | null {
  const normalized = normalizeImportTaskUrl(taskResultUrl);
  try {
    const parsed = new URL(normalized);
    const fromQuery = parsed.searchParams.get('task_id');
    if (fromQuery) return fromQuery;
  } catch {
    // fall through
  }
  const legacy = normalized.match(/task_result_(\d+)\.html/i);
  return legacy?.[1] ?? null;
}

export function normalizeImportTaskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (parsed.hostname === 'www.xcdemon.com') {
      parsed.hostname = 'xcdemon.com';
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

export function normalizeImportEventUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/$/, '') || parsed.pathname;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

export function isIgnoredImportTaskUrl(taskResultUrl: string): boolean {
  return ignoredTaskUrls.has(normalizeImportTaskUrl(taskResultUrl));
}

export function isIgnoredImportEventResultsUrl(resultsUrl: string): boolean {
  return ignoredEventResultsUrls.has(normalizeImportEventUrl(resultsUrl));
}

export function getImportTaskIgnoreList(): ImportTaskIgnoreEntry[] {
  return taskEntries;
}

export function getImportEventIgnoreList(): ImportEventIgnoreEntry[] {
  return eventEntries;
}

export function filterIgnoredImportTasks<T extends { taskResultUrl: string }>(tasks: T[]): T[] {
  return tasks.filter((task) => !isIgnoredImportTaskUrl(task.taskResultUrl));
}

export function isImportableCatalogTask(task: {
  taskResultUrl: string;
  igcZipUrl?: string | null;
}): boolean {
  if (!task.taskResultUrl?.trim()) return false;
  if (!task.igcZipUrl?.trim()) return false;
  return !isIgnoredImportTaskUrl(task.taskResultUrl);
}

export function filterImportableCatalogTasks<
  T extends { taskResultUrl: string; igcZipUrl?: string | null },
>(tasks: T[]): T[] {
  return tasks.filter(isImportableCatalogTask);
}

export function filterIgnoredImportEvents<T extends { resultsUrl: string }>(events: T[]): T[] {
  return events.filter((event) => !isIgnoredImportEventResultsUrl(event.resultsUrl));
}
