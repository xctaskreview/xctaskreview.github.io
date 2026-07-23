import type { FlightTrack, Turnpoint, XcTask } from './types';
import { loadIgcFiles } from './tracks';

export const CIVL_BASE_URL = 'https://civlcomps.org';
const CIVL_FETCH_TIMEOUT_MS = 20_000;
const CIVL_CORS_PROXY = 'https://proxy.cors.sh/';

export interface CivlYearOption {
  year: number;
  label: string;
  pastRange: string;
}

export interface CivlEvent {
  id: number;
  title: string;
  eventLink: string;
  resultsUrl: string;
  cityTitle: string;
  countryTitle: string;
  dateFrom: string;
  dateTo: string;
  label: string;
}

export interface CivlTask {
  taskId: string;
  date: string;
  name: string;
  taskResultUrl: string;
  igcZipUrl: string | null;
  label: string;
}

export interface CivlImportResult {
  task: XcTask;
  taskFileName: string;
  tracks: FlightTrack[];
  trackErrors: string[];
  eventName: string;
  selectedTask: CivlTask;
}

interface CivlApiEvent {
  id: number;
  eventLink: string;
  eventTitle: string;
  cityTitle: string;
  countryTitle: string;
  dateFrom: string;
  dateTo: string;
  participantsCount: number | string;
}

interface CivlEventsJson {
  events?: CivlApiEvent[];
  totalCount?: number;
  pagesCount?: number;
  loadedCount?: number;
}

function resolveCivlUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${CIVL_BASE_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

function buildFetchUrl(url: string): string {
  const absolute = resolveCivlUrl(url);
  if (import.meta.env.DEV) {
    const parsed = new URL(absolute);
    return `/civl-proxy${parsed.pathname}${parsed.search}`;
  }
  return `${CIVL_CORS_PROXY}${absolute}`;
}

async function fetchCivl(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CIVL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(buildFetchUrl(url), {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request to CIVL Comps timed out. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchCivlText(url: string): Promise<string> {
  const response = await fetchCivl(url);
  if (!response.ok) {
    throw new Error(`Could not load CIVL Comps page (${response.status}).`);
  }
  return response.text();
}

export async function fetchCivlBinary(url: string): Promise<ArrayBuffer> {
  const response = await fetchCivl(url);
  if (!response.ok) {
    throw new Error(`Could not download CIVL Comps file (${response.status}).`);
  }
  return response.arrayBuffer();
}

async function fetchCivlJson(url: string): Promise<CivlEventsJson> {
  const response = await fetchCivl(url, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
    },
  });
  if (!response.ok) {
    throw new Error(`Could not load CIVL Comps data (${response.status}).`);
  }
  return response.json() as Promise<CivlEventsJson>;
}

function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function getTableHeaders(table: HTMLTableElement): string[] {
  return [...table.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim() ?? '');
}

function eventHasResults(event: CivlApiEvent): boolean {
  const count = event.participantsCount;
  if (count === '' || count === null || count === undefined) return false;
  return true;
}

function mapCivlEvent(event: CivlApiEvent): CivlEvent {
  const eventLink = resolveCivlUrl(event.eventLink);
  const resultsUrl = `${eventLink.replace(/\/$/, '')}/results`;
  return {
    id: event.id,
    title: event.eventTitle,
    eventLink,
    resultsUrl,
    cityTitle: event.cityTitle,
    countryTitle: event.countryTitle,
    dateFrom: event.dateFrom,
    dateTo: event.dateTo,
    label: `${event.eventTitle} · ${event.cityTitle}, ${event.countryTitle}`,
  };
}

export function parseCivlYears(html: string): CivlYearOption[] {
  const doc = parseDocument(html);
  const years: CivlYearOption[] = [];

  for (const input of doc.querySelectorAll('input.jsPastDate')) {
    const pastRange = input.getAttribute('value') ?? input.getAttribute('data-value') ?? '';
    const title = input.getAttribute('data-title')?.trim() ?? '';
    const label = title || pastRange;
    const yearMatch = title.match(/(\d{4})/) ?? pastRange.match(/^(\d{4})/);
    if (!yearMatch || !pastRange) continue;

    years.push({
      year: Number(yearMatch[1]),
      label,
      pastRange,
    });
  }

  return years.sort((a, b) => b.year - a.year);
}

function buildCivlEventsUrl(pastRange: string, page: number): string {
  const params = new URLSearchParams({
    'search[mode]': 'list',
    'search[dates]': 'past',
    'search[past]': pastRange,
    'search[page]': String(page),
  });
  return `/events?${params.toString()}`;
}

export async function fetchCivlYears(): Promise<CivlYearOption[]> {
  const html = await fetchCivlText('/events');
  const years = parseCivlYears(html);
  if (years.length === 0) {
    throw new Error('Could not find any past event years on CIVL Comps.');
  }
  return years;
}

export async function fetchCivlEvents(pastRange: string): Promise<CivlEvent[]> {
  const events: CivlEvent[] = [];
  let page = 0;
  let loadedCount = 0;
  let totalCount = 0;

  while (true) {
    const response = await fetchCivlJson(buildCivlEventsUrl(pastRange, page));
    const batch = response.events ?? [];

    for (const event of batch) {
      if (!eventHasResults(event)) continue;
      events.push(mapCivlEvent(event));
    }

    loadedCount += response.loadedCount ?? batch.length;
    totalCount = response.totalCount ?? loadedCount;
    const pagesCount = response.pagesCount ?? 0;

    if (totalCount <= loadedCount || pagesCount <= page + 1 || batch.length === 0) {
      break;
    }

    page += 1;
  }

  return events.sort((a, b) => a.title.localeCompare(b.title));
}

function parseIgcZipUrl(container: Element): string | null {
  for (const link of container.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    const label = link.textContent?.trim().toUpperCase() ?? '';
    if (!href) continue;
    if (label.includes('IGC') || /\.zip/i.test(href)) {
      return resolveCivlUrl(href);
    }
  }
  return null;
}

function parseOverallTaskResultUrl(cell: Element): string | null {
  for (const link of cell.querySelectorAll('a.jsResultsLink.link-task, a.link-task')) {
    if (link.textContent?.trim() !== 'Overall') continue;
    const href = link.getAttribute('href');
    if (!href) continue;
    return resolveCivlUrl(href);
  }
  return null;
}

function extractTaskId(taskResultUrl: string): string {
  const match = taskResultUrl.match(/\/results\/([^/?#]+)/i);
  return match?.[1] ?? taskResultUrl;
}

function parseTaskName(dateTask: Element, date: string): string {
  const dateItem = dateTask.querySelector('.date-item');
  const raw = dateItem?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const withoutDate = raw.replace(new RegExp(`^${date.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), '').trim();
  return withoutDate || raw || 'Task';
}

function parseTaskDate(dateTask: Element): string {
  const dateItem = dateTask.querySelector('.date-item');
  const raw = dateItem?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? raw.split(/\s+/)[0] ?? '';
}

export function parseCivlResultsPage(html: string): {
  eventName: string;
  tasks: CivlTask[];
} {
  const doc = parseDocument(html);
  const eventName = doc.querySelector('h1.title-event')?.textContent?.trim() || 'CIVL Event';
  const tasks: CivlTask[] = [];

  for (const row of doc.querySelectorAll('table.task-list tbody tr')) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) continue;

    const dateTask = cells[0].querySelector('.date-task');
    if (!dateTask) continue;

    const taskResultUrl = parseOverallTaskResultUrl(cells[1]);
    const igcZipUrl = parseIgcZipUrl(dateTask);
    if (!taskResultUrl || !igcZipUrl) continue;

    const date = parseTaskDate(dateTask);
    const name = parseTaskName(dateTask, date);
    const taskId = extractTaskId(taskResultUrl);

    tasks.push({
      taskId,
      date,
      name,
      taskResultUrl,
      igcZipUrl,
      label: `${date} · ${name}`,
    });
  }

  return { eventName, tasks };
}

function parseMeters(value: string): number {
  const match = value.match(/([\d.]+)\s*m/i);
  if (!match) throw new Error(`Invalid meter value: ${value}`);
  return Number(match[1]);
}

function validateCoordinates(lat: number, lon: number): { lat: number; lon: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error(`Invalid coordinates: ${lat}, ${lon}`);
  }
  return { lat, lon };
}

function parseLatLonCoordinates(value: string): { lat: number; lon: number } {
  const match = value.match(/Lat:\s*(-?\d+(?:\.\d+)?),\s*Lon:\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) {
    throw new Error(`Invalid coordinates: ${value}`);
  }
  return validateCoordinates(Number(match[1]), Number(match[2]));
}

function normalizeTimeGate(open: string): string {
  const trimmed = open.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hours, minutes] = trimmed.split(':');
    return `${hours.padStart(2, '0')}:${minutes}:00`;
  }
  throw new Error(`Invalid open time: ${open}`);
}

function inferTurnpointType(noLabel: string): Turnpoint['type'] | undefined {
  const upper = noLabel.toUpperCase().trim();
  if (upper.endsWith('SS') || /\bSS\b/.test(upper)) return 'SSS';
  if (upper.endsWith('ES') || /\bES\b/.test(upper)) return 'ESS';
  return undefined;
}

function readCivlTurnpointRow(row: HTMLTableRowElement) {
  const cells = [...row.querySelectorAll('td')];
  if (cells.length < 8) return null;

  const noLabel = cells[0].textContent?.trim() ?? '';
  const id = cells[2].textContent?.trim() ?? '';
  const radius = parseMeters(cells[3].textContent?.trim() ?? '');
  const open = cells[4].textContent?.trim() ?? '';
  const coordinatesText = cells[6].textContent?.trim() ?? '';
  const { lat, lon } = parseLatLonCoordinates(coordinatesText);
  const altitude = parseMeters(cells[7].textContent?.trim() ?? '');

  return { noLabel, id, radius, open, lat, lon, altitude };
}

function findTurnpointTable(doc: Document): HTMLTableElement {
  for (const table of doc.querySelectorAll('table')) {
    const headers = getTableHeaders(table);
    if (
      headers.includes('No') &&
      headers.includes('Radius') &&
      headers.includes('Open') &&
      headers.includes('Close') &&
      headers.includes('Coordinates') &&
      headers.includes('Altitude')
    ) {
      return table;
    }
  }
  throw new Error('Could not find turnpoint table on CIVL task results page.');
}

function parseTaskStartTime(doc: Document, turnpointRows: ReturnType<typeof readCivlTurnpointRow>[]): string | undefined {
  const ssRow = turnpointRows.find((row) => row && inferTurnpointType(row.noLabel) === 'SSS');
  if (ssRow?.open) {
    return normalizeTimeGate(ssRow.open);
  }

  const taskBlock = doc.querySelector('.task-block');
  const text = taskBlock?.textContent ?? '';
  const match = text.match(/Start at\s+(\d{1,2}:\d{2}(?::\d{2})?)/i);
  if (match) {
    return normalizeTimeGate(match[1]);
  }

  return undefined;
}

export function parseCivlTaskPage(
  html: string,
  meta: Pick<CivlTask, 'name' | 'date' | 'taskId'>,
  eventName?: string,
): XcTask {
  const doc = parseDocument(html);
  const table = findTurnpointTable(doc);
  const rows = [...table.querySelectorAll('tbody tr')];
  if (rows.length === 0) {
    throw new Error('Task results page has no turnpoints.');
  }

  const parsedRows = rows
    .map((row) => readCivlTurnpointRow(row as HTMLTableRowElement))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const turnpoints: Turnpoint[] = parsedRows.map((parsed, index) => ({
    radius: parsed.radius,
    type: inferTurnpointType(parsed.noLabel),
    waypoint: {
      name: parsed.id || `TP${index + 1}`,
      lat: parsed.lat,
      lon: parsed.lon,
      altSmoothed: parsed.altitude,
    },
  }));

  if (turnpoints.length === 0) {
    throw new Error('Could not parse any turnpoints from CIVL task results.');
  }

  const startGate = parseTaskStartTime(doc, parsedRows);
  const taskName = `${meta.name} ${meta.date}`.trim();
  const location = eventName?.trim() || meta.name;

  return {
    version: 1,
    taskType: 'CLASSIC',
    name: taskName,
    taskName,
    location,
    eventDate: meta.date,
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

export async function fetchCivlResults(resultsUrl: string) {
  const html = await fetchCivlText(resultsUrl);
  return parseCivlResultsPage(html);
}

export async function importCivlTask(
  selectedTask: CivlTask,
  eventName?: string,
): Promise<CivlImportResult> {
  const taskHtml = await fetchCivlText(selectedTask.taskResultUrl);
  const task = parseCivlTaskPage(taskHtml, selectedTask, eventName);
  const taskFileName = `civl-${selectedTask.taskId}-${selectedTask.date}.json`;

  let tracks: FlightTrack[] = [];
  const trackErrors: string[] = [];

  if (selectedTask.igcZipUrl) {
    const zipBuffer = await fetchCivlBinary(selectedTask.igcZipUrl);
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
    eventName: eventName ?? `${selectedTask.name} ${selectedTask.date}`,
    selectedTask,
  };
}
