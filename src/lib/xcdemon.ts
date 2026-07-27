import type { FlightTrack, Turnpoint, XcTask } from './types';
import { loadIgcFiles } from './tracks';
import { parseImportCoordinates } from './importCoordinates';
import { filterImportableCatalogTasks } from './importTaskIgnoreList';

export const XCDEMON_DEFAULT_LEAGUE_ID = 17;
export const XCDEMON_BASE_URL = 'https://xcdemon.com';
export const XCDEMON_TASK_TIME_ZONE = 'America/Los_Angeles';
const XCDEMON_FETCH_TIMEOUT_MS = 20_000;
const XCDEMON_CORS_PROXY = 'https://proxy.cors.sh/';

export interface XcdemonLeague {
  id: number;
  name: string;
}

export interface XcdemonArchivedSeason {
  leagueId: number;
  leagueName: string;
  startDate: string;
  endDate: string;
  year: number;
  label: string;
  entryId: string;
}

export interface XcdemonArchivedLeague {
  leagueId: number;
  leagueName: string;
  latestStartDate: string;
  defaultYear: number;
}

const ARCHIVED_DATE_RANGE_RE = /^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/;

export interface XcdemonLeagueTask {
  taskId: string;
  location: string;
  date: string;
  status: string;
  taskResultUrl: string;
  igcZipUrl: string | null;
  label: string;
}

export interface XcdemonImportResult {
  task: XcTask;
  taskFileName: string;
  tracks: FlightTrack[];
  trackErrors: string[];
  leagueName: string;
  selectedTask: XcdemonLeagueTask;
}

function resolveXcdemonUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${XCDEMON_BASE_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

function buildFetchUrl(url: string): string {
  const absolute = resolveXcdemonUrl(url);
  if (import.meta.env.DEV) {
    const parsed = new URL(absolute);
    const proxyPrefix =
      parsed.hostname === 'www.xcdemon.com' ? '/xcdemon-www-proxy' : '/xcdemon-proxy';
    return `${proxyPrefix}${parsed.pathname}${parsed.search}`;
  }
  return `${XCDEMON_CORS_PROXY}${absolute}`;
}

async function fetchXcdemon(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), XCDEMON_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(buildFetchUrl(url), {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request to XCDemon timed out. Please try again.');
    }
    if (error instanceof TypeError) {
      throw new Error(
        'Could not reach XCDemon. Check your network, disable ad blockers for this site, or run the app with npm run dev (local proxy).',
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchXcdemonText(url: string): Promise<string> {
  const response = await fetchXcdemon(url);
  if (!response.ok) {
    throw new Error(`Could not load XCDemon page (${response.status}).`);
  }
  return response.text();
}

export async function fetchXcdemonBinary(url: string): Promise<ArrayBuffer> {
  const response = await fetchXcdemon(url);
  if (!response.ok) {
    throw new Error(`Could not download XCDemon file (${response.status}).`);
  }
  return response.arrayBuffer();
}

function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function getTableHeaders(table: HTMLTableElement): string[] {
  const fromThead = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim() ?? '');
  if (fromThead.length > 0) return fromThead;

  const firstRow = table.querySelector('tr');
  if (!firstRow) return [];
  return [...firstRow.querySelectorAll('th')].map((cell) => cell.textContent?.trim() ?? '');
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\./g, '').trim();
}

function headerIsTurnpointId(header: string): boolean {
  return header === 'id' || header.startsWith('id ');
}

function tableHasTurnpointHeaders(headers: string[]): boolean {
  const normalized = headers.map(normalizeHeader);
  return (
    normalized.some(headerIsTurnpointId) &&
    normalized.some((header) => header === 'radius') &&
    normalized.some((header) => header.includes('coordinate')) &&
    normalized.some((header) => header === 'altitude')
  );
}

interface TurnpointColumnMap {
  no: number;
  id: number;
  radius: number;
  open: number;
  coordinates: number;
  altitude: number;
}

function buildTurnpointColumnMap(headers: string[]): TurnpointColumnMap | null {
  const normalized = headers.map(normalizeHeader);
  const idx = (pred: (h: string) => boolean) => normalized.findIndex(pred);

  const radius = idx((h) => h === 'radius');
  const coordinates = idx((h) => h.includes('coordinate'));
  const altitude = idx((h) => h === 'altitude');
  const id = idx(headerIsTurnpointId);
  const open = idx((h) => h === 'open');
  if (radius < 0 || coordinates < 0 || altitude < 0 || id < 0 || open < 0) {
    return null;
  }

  const no = idx((h) => h === 'no' || h.startsWith('no '));

  return {
    no: no >= 0 ? no : 0,
    id,
    radius,
    open,
    coordinates,
    altitude,
  };
}

export function isXcdemonTaskResultUnavailable(html: string): boolean {
  return /task result not found|Something went wrong while loading the task result/i.test(html);
}

function parseYears(doc: Document): number[] {
  const years = new Set<number>();
  for (const link of doc.querySelectorAll('a[href*="id=results"][href*="year="]')) {
    const href = link.getAttribute('href') ?? '';
    const match = href.match(/[?&]year=(\d{4})/);
    if (match) years.add(Number(match[1]));
  }

  if (years.size === 0) {
    years.add(new Date().getFullYear());
  }

  return [...years].sort((a, b) => b - a);
}

function parseLeagueName(doc: Document): string {
  return doc.querySelector('h1')?.textContent?.trim() || 'XCDemon League';
}

export function parseActiveLeagues(doc: Document): XcdemonLeague[] {
  const select = doc.querySelector('#league_id');
  if (!select) return [];

  const leagues: XcdemonLeague[] = [];
  let inActiveSection = false;

  for (const option of select.querySelectorAll('option')) {
    const label = option.textContent?.trim() ?? '';
    const value = option.getAttribute('value') ?? '';

    if (option.hasAttribute('disabled') && /active leagues/i.test(label)) {
      inActiveSection = true;
      continue;
    }

    if (option.hasAttribute('disabled') && inActiveSection) {
      if (/past leagues|archived leagues/i.test(label)) {
        break;
      }
      continue;
    }

    if (!inActiveSection) continue;

    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) continue;

    leagues.push({ id, name: label });
  }

  return leagues;
}

interface RawArchivedSeason {
  leagueId: number;
  leagueName: string;
  startDate: string;
  endDate: string;
}

export function parseArchivedLeagueSeasons(doc: Document): RawArchivedSeason[] {
  const h1 = [...doc.querySelectorAll('h1')].find((el) => el.textContent?.trim() === 'All Leagues');
  if (!h1) return [];

  let list: Element | null = h1.nextElementSibling;
  while (list && list.tagName !== 'UL') {
    list = list.nextElementSibling;
  }
  if (!list) return [];

  const entries: RawArchivedSeason[] = [];
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
    if (!Number.isInteger(leagueId) || leagueId <= 0 || !leagueName) continue;

    const datesList = children[index + 1];
    if (!datesList || datesList.tagName !== 'UL') continue;

    for (const dateItem of datesList.querySelectorAll(':scope > li')) {
      const text = dateItem.textContent?.trim() ?? '';
      const match = text.match(ARCHIVED_DATE_RANGE_RE);
      if (!match) continue;

      entries.push({
        leagueId,
        leagueName,
        startDate: match[1],
        endDate: match[2],
      });
    }
  }

  return entries;
}

export function buildArchivedSeasonCatalog(raw: RawArchivedSeason[]): XcdemonArchivedSeason[] {
  const byLeague = new Map<number, RawArchivedSeason[]>();
  for (const entry of raw) {
    const leagueEntries = byLeague.get(entry.leagueId) ?? [];
    leagueEntries.push(entry);
    byLeague.set(entry.leagueId, leagueEntries);
  }

  const catalog: XcdemonArchivedSeason[] = [];

  for (const leagueEntries of byLeague.values()) {
    const startYears = leagueEntries.map((entry) => Number(entry.startDate.slice(0, 4)));
    const showYearOnly = new Set(startYears).size === startYears.length;

    for (const entry of leagueEntries) {
      const year = Number(entry.startDate.slice(0, 4));
      const suffix = showYearOnly ? String(year) : entry.startDate;
      catalog.push({
        leagueId: entry.leagueId,
        leagueName: entry.leagueName,
        startDate: entry.startDate,
        endDate: entry.endDate,
        year,
        label: `${entry.leagueName} · ${suffix}`,
        entryId: `${entry.leagueId}-${entry.startDate}`,
      });
    }
  }

  catalog.sort((a, b) => b.startDate.localeCompare(a.startDate));
  return catalog;
}

export function buildArchivedLeagueCatalog(seasons: XcdemonArchivedSeason[]): XcdemonArchivedLeague[] {
  const byLeague = new Map<number, XcdemonArchivedSeason[]>();
  for (const season of seasons) {
    const leagueSeasons = byLeague.get(season.leagueId) ?? [];
    leagueSeasons.push(season);
    byLeague.set(season.leagueId, leagueSeasons);
  }

  const leagues: XcdemonArchivedLeague[] = [];
  for (const leagueSeasons of byLeague.values()) {
    const latest = leagueSeasons.reduce((best, season) =>
      season.startDate.localeCompare(best.startDate) > 0 ? season : best,
    );
    leagues.push({
      leagueId: latest.leagueId,
      leagueName: latest.leagueName,
      latestStartDate: latest.startDate,
      defaultYear: latest.year,
    });
  }

  leagues.sort((a, b) => b.latestStartDate.localeCompare(a.latestStartDate));
  return leagues;
}

export function buildArchivedYearsFromSeasons(seasons: XcdemonArchivedSeason[]): number[] {
  const years = new Set(seasons.map((season) => season.year));
  return [...years].sort((a, b) => b - a);
}

export function leagueIdsForArchivedYear(seasons: XcdemonArchivedSeason[], year: number): number[] {
  const ids = new Set<number>();
  for (const season of seasons) {
    if (season.year === year) ids.add(season.leagueId);
  }
  return [...ids];
}

export interface XcdemonLeagueWithTasks {
  leagueId: number;
  leagueName: string;
  tasks: XcdemonLeagueTask[];
}

export function parseXcdemonArchivedLeaguesPage(html: string): XcdemonArchivedSeason[] {
  return buildArchivedSeasonCatalog(parseArchivedLeagueSeasons(parseDocument(html)));
}

function parseIgcZipUrl(trackLogsCell: Element): string | null {
  for (const link of trackLogsCell.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    if (!href) continue;
    const label = link.textContent?.trim().toUpperCase() ?? '';
    if (label === 'IGC' || /-igcs\.zip/i.test(href)) {
      return resolveXcdemonUrl(href);
    }
  }
  return null;
}

function parseTaskResultFromCell(
  resultsCell: Element,
): { taskId: string; taskResultUrl: string } | null {
  let modern: { taskId: string; taskResultUrl: string } | null = null;
  let legacy: { taskId: string; taskResultUrl: string } | null = null;

  for (const link of resultsCell.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href') ?? '';

    const modernMatch = href.match(/results_task\.php(?:\?|.*?&)(?:.*?&)?task_id=(\d+)/i);
    if (modernMatch) {
      modern = {
        taskId: modernMatch[1],
        taskResultUrl: resolveXcdemonUrl(href),
      };
    }

    const legacyMatch = href.match(/task_result_(\d+)\.html/i);
    if (legacyMatch) {
      legacy = {
        taskId: legacyMatch[1],
        taskResultUrl: resolveXcdemonUrl(href),
      };
    }
  }

  return legacy ?? modern;
}

export function parseXcdemonResultsPage(
  html: string,
  _leagueId: number,
): {
  leagueName: string;
  activeLeagues: XcdemonLeague[];
  years: number[];
  tasks: XcdemonLeagueTask[];
} {
  const doc = parseDocument(html);
  const tasks: XcdemonLeagueTask[] = [];

  for (const row of doc.querySelectorAll('#myTable tr')) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) continue;

    const location = cells[0].textContent?.trim() ?? '';
    const date = cells[1].textContent?.trim() ?? '';
    const status = cells[2].textContent?.trim() ?? '';
    if (!location || !date || location.toUpperCase() === 'OVERALL') continue;

    const taskResult = parseTaskResultFromCell(cells[3]);
    if (!taskResult) continue;

    tasks.push({
      taskId: taskResult.taskId,
      location,
      date,
      status,
      taskResultUrl: taskResult.taskResultUrl,
      igcZipUrl: parseIgcZipUrl(cells[4]),
      label: `${date} · ${location}`,
    });
  }

  return {
    leagueName: parseLeagueName(doc),
    activeLeagues: parseActiveLeagues(doc),
    years: parseYears(doc),
    tasks: filterImportableCatalogTasks(tasks),
  };
}

function parseMeters(value: string): number {
  const match = value.match(/([\d.]+)\s*m/i);
  if (!match) throw new Error(`Invalid meter value: ${value}`);
  return Number(match[1]);
}

function parseOptionalMeters(value: string): number {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'm') return 0;
  try {
    return parseMeters(trimmed);
  } catch {
    return 0;
  }
}

function parseCoordinates(value: string): { lat: number; lon: number } {
  return parseImportCoordinates(value);
}

function normalizeTimeGate(open: string): string {
  const trimmed = open.trim();
  if (!trimmed) throw new Error('Invalid open time: (empty)');
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hours, minutes] = trimmed.split(':');
    return `${hours.padStart(2, '0')}:${minutes}:00`;
  }
  throw new Error(`Invalid open time: ${open}`);
}

function readTurnpointRow(row: HTMLTableRowElement, columns: TurnpointColumnMap) {
  const cells = [...row.querySelectorAll('td')];
  const maxIdx = Math.max(
    columns.no,
    columns.id,
    columns.radius,
    columns.open,
    columns.coordinates,
    columns.altitude,
  );
  if (cells.length <= maxIdx) return null;

  const noLabel = cells[columns.no].textContent?.trim() ?? '';
  const id = cells[columns.id].textContent?.trim() ?? '';
  const radius = parseMeters(cells[columns.radius].textContent?.trim() ?? '');
  const open = cells[columns.open].textContent?.trim() ?? '';
  const coordinatesCell = cells[columns.coordinates];
  const coordinatesLink = coordinatesCell.querySelector('a');
  const coordinatesText =
    coordinatesLink?.textContent?.trim() ||
    coordinatesLink?.getAttribute('href') ||
    coordinatesCell.textContent?.trim() ||
    '';
  const { lat, lon } = parseCoordinates(coordinatesText);
  const altitude = parseOptionalMeters(cells[columns.altitude].textContent?.trim() ?? '');

  return { noLabel, id, radius, open, lat, lon, altitude };
}

function turnpointDataRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const fromBody = [...table.querySelectorAll('tbody tr')].filter((row) => row.querySelector('td'));
  if (fromBody.length > 0) return fromBody as HTMLTableRowElement[];
  return [...table.querySelectorAll('tr')].filter((row) => row.querySelector('td')) as HTMLTableRowElement[];
}

function findTurnpointTable(doc: Document): HTMLTableElement {
  const searchRoots: ParentNode[] = [];
  const taskRoot = doc.querySelector('#task');
  if (taskRoot) searchRoots.push(taskRoot);
  searchRoots.push(doc);

  for (const root of searchRoots) {
    for (const table of root.querySelectorAll('table')) {
      if (tableHasTurnpointHeaders(getTableHeaders(table))) {
        return table;
      }
    }
  }
  throw new Error('Could not find turnpoint table on task results page.');
}

function inferTurnpointType(noLabel: string): Turnpoint['type'] | undefined {
  const upper = noLabel.toUpperCase().trim();
  if (/\bS-IN\b/i.test(noLabel) || /\bSS\b/.test(upper) || upper.includes('SSS')) return 'SSS';
  if (/\bES\b/.test(upper) || upper.includes('ESS')) return 'ESS';
  return undefined;
}

export function parseXcdemonTaskPage(
  html: string,
  meta: Pick<XcdemonLeagueTask, 'location' | 'date' | 'taskId'>,
): XcTask {
  if (isXcdemonTaskResultUnavailable(html)) {
    throw new Error('XCDemon task result file is missing on the server.');
  }

  const doc = parseDocument(html);
  const table = findTurnpointTable(doc);
  const columns = buildTurnpointColumnMap(getTableHeaders(table));
  if (!columns) {
    throw new Error('Could not parse turnpoint table headers on task results page.');
  }
  const rows = turnpointDataRows(table);
  if (rows.length === 0) {
    throw new Error('Task results page has no turnpoints.');
  }

  const turnpoints: Turnpoint[] = [];
  const firstRow = readTurnpointRow(rows[0], columns);
  const startGate = firstRow?.open ? normalizeTimeGate(firstRow.open) : undefined;

  rows.forEach((row, index) => {
    const parsed = readTurnpointRow(row, columns);
    if (!parsed) return;

    turnpoints.push({
      radius: parsed.radius,
      type: inferTurnpointType(parsed.noLabel),
      waypoint: {
        name: parsed.id || `TP${index + 1}`,
        lat: parsed.lat,
        lon: parsed.lon,
        altSmoothed: parsed.altitude,
      },
    });
  });

  if (turnpoints.length === 0) {
    throw new Error('Could not parse any turnpoints from task results.');
  }

  const taskName = `${meta.location} ${meta.date}`;

  return {
    version: 1,
    taskType: 'CLASSIC',
    name: taskName,
    taskName,
    location: meta.location,
    eventDate: meta.date,
    timeZone: XCDEMON_TASK_TIME_ZONE,
    turnpoints,
    sss: startGate
      ? {
          type: 'RACE',
          direction: 'EXIT',
          timeGates: [startGate],
        }
      : undefined,
    goal: {
      type: 'CYLINDER',
    },
    earthModel: 'WGS84',
  };
}

export function getXcdemonArchivedLeaguesUrl(): string {
  return `${XCDEMON_BASE_URL}/index.php?leagueappid=41&id=archived_leagues`;
}

export function getXcdemonResultsUrl(leagueId: number, year?: number): string {
  const params = new URLSearchParams({
    leagueappid: String(leagueId),
    id: 'results',
  });
  if (year !== undefined) params.set('year', String(year));
  return `${XCDEMON_BASE_URL}/index.php?${params.toString()}`;
}

export async function fetchXcdemonResults(leagueId: number, year?: number) {
  const html = await fetchXcdemonText(getXcdemonResultsUrl(leagueId, year));
  return parseXcdemonResultsPage(html, leagueId);
}

export async function fetchXcdemonImportableYears(
  leagueId: number,
  preferredYear?: number,
): Promise<{
  leagueName: string;
  years: number[];
  selectedYear: number;
  tasks: XcdemonLeagueTask[];
}> {
  const initial = await fetchXcdemonResults(leagueId, preferredYear);
  const candidateYears = initial.years;

  const byYear = await Promise.all(
    candidateYears.map(async (year) => {
      const page =
        year === preferredYear || (preferredYear === undefined && year === candidateYears[0])
          ? initial
          : await fetchXcdemonResults(leagueId, year);
      return { year, tasks: page.tasks, leagueName: page.leagueName };
    }),
  );

  const importable = byYear.filter((entry) => entry.tasks.length > 0);
  const years = importable.map((entry) => entry.year).sort((a, b) => b - a);

  if (years.length === 0) {
    const fallbackYear = preferredYear ?? candidateYears[0] ?? new Date().getFullYear();
    return {
      leagueName: initial.leagueName,
      years: [],
      selectedYear: fallbackYear,
      tasks: [],
    };
  }

  const selectedYear =
    preferredYear !== undefined && years.includes(preferredYear) ? preferredYear : years[0];
  const tasks = importable.find((entry) => entry.year === selectedYear)?.tasks ?? [];

  return {
    leagueName: importable.find((entry) => entry.year === selectedYear)?.leagueName ?? initial.leagueName,
    years,
    selectedYear,
    tasks,
  };
}

export async function fetchXcdemonActiveLeagues(
  leagueId: number = XCDEMON_DEFAULT_LEAGUE_ID,
): Promise<XcdemonLeague[]> {
  const html = await fetchXcdemonText(getXcdemonResultsUrl(leagueId));
  return parseActiveLeagues(parseDocument(html));
}

export async function fetchXcdemonArchivedSeasons(): Promise<XcdemonArchivedSeason[]> {
  const html = await fetchXcdemonText(getXcdemonArchivedLeaguesUrl());
  const seasons = parseXcdemonArchivedLeaguesPage(html);
  if (seasons.length === 0) {
    throw new Error('No archived leagues were found on XCDemon.');
  }
  return seasons;
}

export async function fetchXcdemonLeaguesWithTasksForYear(
  year: number,
  seasons: XcdemonArchivedSeason[],
): Promise<XcdemonLeagueWithTasks[]> {
  const leagueIds = leagueIdsForArchivedYear(seasons, year);
  const results = await Promise.all(
    leagueIds.map(async (leagueId) => {
      const page = await fetchXcdemonResults(leagueId, year);
      return { leagueId, leagueName: page.leagueName, tasks: page.tasks };
    }),
  );

  return results
    .filter((entry) => entry.tasks.length > 0)
    .sort((a, b) => a.leagueName.localeCompare(b.leagueName));
}

export async function fetchXcdemonArchivedLeagues(): Promise<XcdemonArchivedLeague[]> {
  const seasons = await fetchXcdemonArchivedSeasons();
  return buildArchivedLeagueCatalog(seasons);
}

export async function importXcdemonTask(selectedTask: XcdemonLeagueTask): Promise<XcdemonImportResult> {
  const taskHtml = await fetchXcdemonText(selectedTask.taskResultUrl);
  const task = parseXcdemonTaskPage(taskHtml, selectedTask);
  const taskFileName = `xcdemon-${selectedTask.taskId}-${selectedTask.date}.json`;

  let tracks: FlightTrack[] = [];
  const trackErrors: string[] = [];

  if (selectedTask.igcZipUrl) {
    const zipBuffer = await fetchXcdemonBinary(selectedTask.igcZipUrl);
    const zipFile = new File([zipBuffer], `${selectedTask.taskId}-igcs.zip`, {
      type: 'application/zip',
    });
    const loaded = await loadIgcFiles([zipFile]);
    tracks = loaded.tracks;
    trackErrors.push(...loaded.errors);
  }

  return {
    task,
    taskFileName,
    tracks,
    trackErrors,
    leagueName: `${selectedTask.location} ${selectedTask.date}`,
    selectedTask,
  };
}
