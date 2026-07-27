/**
 * Network audit: XCDemon + CIVL task result HTML vs current parsers.
 * Run: npx tsx scripts/audit-task-parsers.ts
 */
import { appendFileSync, createReadStream, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { Window } from 'happy-dom';

function setupDom(): void {
  const window = new Window({ url: 'https://local.test/' });
  const g = globalThis as typeof globalThis & {
    window: Window;
    document: Document;
    DOMParser: typeof DOMParser;
    HTMLElement: typeof HTMLElement;
    HTMLTableElement: typeof HTMLTableElement;
    HTMLTableRowElement: typeof HTMLTableRowElement;
  };
  g.window = window;
  g.document = window.document;
  g.DOMParser = window.DOMParser;
  g.HTMLElement = window.HTMLElement;
  g.HTMLTableElement = window.HTMLTableElement;
  g.HTMLTableRowElement = window.HTMLTableRowElement;
}

let domParseCount = 0;

function maybeResetDom(): void {
  domParseCount += 1;
  if (domParseCount % DOM_RESET_EVERY === 0) {
    setupDom();
  }
}

setupDom();

const {
  buildArchivedLeagueCatalog,
  getXcdemonArchivedLeaguesUrl,
  getXcdemonResultsUrl,
  parseXcdemonArchivedLeaguesPage,
  parseXcdemonResultsPage,
  parseXcdemonTaskPage,
} = await import('../src/lib/xcdemon.ts');

const {
  CIVL_BASE_URL,
  parseCivlResultsPage,
  parseCivlTaskPage,
  parseCivlYears,
} = await import('../src/lib/civl.ts');

const DELAY_MS = 350;
const FETCH_TIMEOUT_MS = 25_000;
const REPORT_PATH = join(process.cwd(), 'scripts', 'audit-task-parsers-report.json');
const REFS_PATH = join(process.cwd(), 'scripts', 'audit-task-refs.jsonl');
const RESULTS_PATH = join(process.cwd(), 'scripts', 'audit-task-results.jsonl');
const DOM_RESET_EVERY = 10;
const SKIP_COLLECT = process.env.SKIP_COLLECT === '1';
const RESUME_AUDIT = process.env.RESUME_AUDIT === '1';
const WRITE_REPORT_ONLY = process.env.WRITE_REPORT_ONLY === '1';
const AUDIT_OFFSET = Number(process.env.AUDIT_OFFSET ?? 0);
const AUDIT_LIMIT = process.env.AUDIT_LIMIT ? Number(process.env.AUDIT_LIMIT) : undefined;
const MAX_NEW_AUDITS = process.env.MAX_NEW_AUDITS ? Number(process.env.MAX_NEW_AUDITS) : undefined;

/** Latest season only per archived league (first pass). */
const XCDEMON_LATEST_YEAR_ONLY = true;
const MAX_YEARS_PER_LEAGUE = 3;

interface TaskRef {
  source: 'xcdemon' | 'civl';
  taskResultUrl: string;
  igcZipUrl: string | null;
  taskId: string;
  label: string;
  context: string;
}

type FailureCategory =
  | 'fetch_error'
  | 'no_turnpoint_table'
  | 'header_mismatch'
  | 'empty_turnpoint_rows'
  | 'row_structure_mismatch'
  | 'coordinate_parse_error'
  | 'radius_or_altitude_parse_error'
  | 'time_gate_parse_error'
  | 'other_parse_error'
  | 'ok';

interface TableProbe {
  found: boolean;
  headers: string[];
  headerMatch: 'xcdemon' | 'civl' | 'partial' | 'none';
  rowCount: number;
}

interface TaskAuditResult {
  source: 'xcdemon' | 'civl';
  taskResultUrl: string;
  igcZipUrl: string | null;
  label: string;
  context: string;
  igcZipPresent: boolean;
  currentParser: FailureCategory;
  currentParserError: string | null;
  turnpointCount: number | null;
  tableProbe: TableProbe;
  fixedParser: FailureCategory;
  fixedParserError: string | null;
  fixedTurnpointCount: number | null;
  suggestedFix: string | null;
}

interface AuditReport {
  generatedAt: string;
  options: { delayMs: number; xcdemonLatestYearOnly: boolean; maxYearsPerLeague: number };
  summary: {
    totalTasks: number;
    uniqueTaskUrls: number;
    byCurrentParser: Record<string, number>;
    byFixedParser: Record<string, number>;
    failureCategories: {
      category: FailureCategory;
      count: number;
      exampleUrls: string[];
      suggestedFix: string | null;
    }[];
  };
  tasks: TaskAuditResult[];
  tasksOkCount?: number;
  errors: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    await sleep(DELAY_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'xc-task-review-parser-audit/1.0',
        Accept: 'text/html,application/json,*/*',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string, extraHeaders?: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    await sleep(DELAY_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'xc-task-review-parser-audit/1.0',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        ...extraHeaders,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

function parseDocument(html: string): Document {
  maybeResetDom();
  return new DOMParser().parseFromString(html, 'text/html');
}

function getTableHeaders(table: HTMLTableElement): string[] {
  return [...table.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim() ?? '');
}

function classifyHeaders(headers: string[]): TableProbe['headerMatch'] {
  const has = (name: string) => headers.some((h) => h.toLowerCase() === name.toLowerCase());
  const xcdemon =
    has('Id') &&
    has('Radius') &&
    has('Open') &&
    has('Close') &&
    has('Coordinates') &&
    has('Altitude');
  const civl =
    has('No') &&
    has('Radius') &&
    has('Open') &&
    has('Close') &&
    has('Coordinates') &&
    has('Altitude');
  if (xcdemon) return 'xcdemon';
  if (civl) return 'civl';
  const partial =
    (has('Radius') || has('radius')) &&
    (has('Coordinates') || has('coordinates')) &&
    (has('Altitude') || has('altitude'));
  return partial ? 'partial' : 'none';
}

function probeTurnpointTable(html: string): TableProbe {
  const doc = parseDocument(html);
  let best: TableProbe = {
    found: false,
    headers: [],
    headerMatch: 'none',
    rowCount: 0,
  };

  for (const table of doc.querySelectorAll('table')) {
    const headers = getTableHeaders(table as HTMLTableElement);
    if (headers.length === 0) continue;
    const match = classifyHeaders(headers);
    const rows = table.querySelectorAll('tbody tr');
    if (match === 'none' && !headers.some((h) => /radius|coordinates|altitude/i.test(h))) {
      continue;
    }
    const candidate: TableProbe = {
      found: match !== 'none' || headers.some((h) => /coordinates/i.test(h)),
      headers,
      headerMatch: match,
      rowCount: rows.length,
    };
    if (
      !best.found ||
      (candidate.headerMatch !== 'none' && best.headerMatch === 'none') ||
      candidate.rowCount > best.rowCount
    ) {
      best = candidate;
    }
  }

  return best;
}

function categorizeError(message: string): FailureCategory {
  const m = message.toLowerCase();
  if (m.includes('could not find turnpoint table')) return 'no_turnpoint_table';
  if (m.includes('no turnpoints')) return 'empty_turnpoint_rows';
  if (m.includes('invalid coordinates')) return 'coordinate_parse_error';
  if (m.includes('invalid meter')) return 'radius_or_altitude_parse_error';
  if (m.includes('invalid open time')) return 'time_gate_parse_error';
  if (m.includes('could not parse any turnpoints')) return 'row_structure_mismatch';
  return 'other_parse_error';
}

function tryParseCurrent(source: 'xcdemon' | 'civl', html: string, ref: TaskRef): {
  category: FailureCategory;
  error: string | null;
  count: number | null;
} {
  try {
    if (source === 'xcdemon') {
      const meta = {
        location: ref.label,
        date: '1970-01-01',
        taskId: ref.taskId,
      };
      const task = parseXcdemonTaskPage(html, meta);
      return { category: 'ok', error: null, count: task.turnpoints.length };
    }
    const meta = { name: ref.label, date: '1970-01-01', taskId: ref.taskId };
    const task = parseCivlTaskPage(html, meta, ref.context);
    return { category: 'ok', error: null, count: task.turnpoints.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { category: categorizeError(error), error, count: null };
  }
}

/** Lenient parse: accept No/Id header sets; XCDemon-style coords on CIVL pages and vice versa. */
function tryParseFixed(source: 'xcdemon' | 'civl', html: string): {
  category: FailureCategory;
  error: string | null;
  count: number | null;
  suggestedFix: string | null;
} {
  const doc = parseDocument(html);

  const findTable = (): HTMLTableElement | null => {
    for (const table of doc.querySelectorAll('table')) {
      const headers = getTableHeaders(table as HTMLTableElement);
      const match = classifyHeaders(headers);
      if (match !== 'none') return table as HTMLTableElement;
      if (
        headers.some((h) => /id|^no$/i.test(h)) &&
        headers.some((h) => /radius/i.test(h)) &&
        headers.some((h) => /coordinates/i.test(h))
      ) {
        return table as HTMLTableElement;
      }
    }
    return null;
  };

  const parseMeters = (value: string): number => {
    const match = value.match(/([\d.]+)\s*m/i);
    if (!match) throw new Error(`Invalid meter value: ${value}`);
    return Number(match[1]);
  };

  const parseCoords = (text: string): { lat: number; lon: number } => {
    const decoded = decodeURIComponent(text.trim());
    const latLon = decoded.match(/Lat:\s*(-?\d+(?:\.\d+)?),\s*Lon:\s*(-?\d+(?:\.\d+)?)/i);
    if (latLon) return { lat: Number(latLon[1]), lon: Number(latLon[2]) };
    const atMatch = decoded.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (atMatch) return { lat: Number(atMatch[1]), lon: Number(atMatch[2]) };
    const comma = decoded.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (comma) return { lat: Number(comma[1]), lon: Number(comma[2]) };
    throw new Error(`Invalid coordinates: ${text}`);
  };

  try {
    const table = findTable();
    if (!table) {
      return {
        category: 'no_turnpoint_table',
        error: 'No matching turnpoint table (lenient)',
        count: null,
        suggestedFix: 'Broaden findTurnpointTable header matching (Id vs No, case)',
      };
    }

    const headers = getTableHeaders(table);
    const idIdx = headers.findIndex((h) => /^id$/i.test(h));
    const noIdx = headers.findIndex((h) => /^no$/i.test(h));
    const radiusIdx = headers.findIndex((h) => /^radius$/i.test(h));
    const coordIdx = headers.findIndex((h) => /^coordinates$/i.test(h));
    const altIdx = headers.findIndex((h) => /^altitude$/i.test(h));

    let parsed = 0;
    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 4) continue;

      let coordText = '';
      if (coordIdx >= 0 && cells[coordIdx]) {
        const cell = cells[coordIdx];
        const link = cell.querySelector('a');
        coordText =
          link?.textContent?.trim() ||
          link?.getAttribute('href') ||
          cell.textContent?.trim() ||
          '';
      } else if (cells.length >= 7) {
        const cell = cells[6];
        const link = cell.querySelector('a');
        coordText =
          link?.textContent?.trim() ||
          link?.getAttribute('href') ||
          cell.textContent?.trim() ||
          '';
      }

      const radiusText =
        radiusIdx >= 0 ? (cells[radiusIdx]?.textContent?.trim() ?? '') : cells[3]?.textContent?.trim() ?? '';
      const altText =
        altIdx >= 0 ? (cells[altIdx]?.textContent?.trim() ?? '') : cells[7]?.textContent?.trim() ?? '';

      parseMeters(radiusText);
      parseCoords(coordText);
      if (altText) parseMeters(altText);
      if (idIdx >= 0 || noIdx >= 0 || cells.length >= 8) parsed += 1;
    }

    if (parsed === 0) {
      return {
        category: 'row_structure_mismatch',
        error: `Table headers [${headers.join(', ')}] but 0 lenient rows`,
        count: null,
        suggestedFix:
          source === 'civl'
            ? 'Parse coordinates from map links like XCDemon (href @lat,lon)'
            : 'Support fewer columns / different cell indices',
      };
    }

    let suggestedFix: string | null = null;
    if (source === 'civl' && headers.some((h) => /^id$/i.test(h))) {
      suggestedFix = 'Accept Id header row layout on CIVL-hosted XCF pages';
    }
    if (source === 'xcdemon' && headers.some((h) => /^no$/i.test(h))) {
      suggestedFix = 'Accept No header (CIVL-style) on XCDemon pages';
    }

    return { category: 'ok', error: null, count: parsed, suggestedFix };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      category: categorizeError(error),
      error,
      count: null,
      suggestedFix:
        categorizeError(error) === 'coordinate_parse_error'
          ? 'Unified coordinate parser: Lat/Lon text, @lat,lon in href, plain decimals'
          : null,
    };
  }
}

async function collectXcdemonTasks(errors: string[], seenUrls: Set<string>): Promise<number> {
  let added = 0;
  try {
    const archivedHtml = await fetchText(getXcdemonArchivedLeaguesUrl());
    maybeResetDom();
    const seasons = parseXcdemonArchivedLeaguesPage(archivedHtml);
    const leagues = buildArchivedLeagueCatalog(seasons);

    const seasonsByLeague = new Map<number, typeof seasons>();
    for (const s of seasons) {
      const list = seasonsByLeague.get(s.leagueId) ?? [];
      list.push(s);
      seasonsByLeague.set(s.leagueId, list);
    }

    for (const league of leagues) {
      const leagueSeasons = (seasonsByLeague.get(league.leagueId) ?? []).sort((a, b) =>
        b.startDate.localeCompare(a.startDate),
      );
      const years = XCDEMON_LATEST_YEAR_ONLY
        ? [league.defaultYear]
        : [...new Set(leagueSeasons.map((s) => s.year))].slice(0, MAX_YEARS_PER_LEAGUE);

      for (const year of years) {
        try {
          const resultsUrl = getXcdemonResultsUrl(league.leagueId, year);
          let html = await fetchText(resultsUrl);
          const parsed = parseXcdemonResultsPage(html, league.leagueId);
          html = '';
          maybeResetDom();
          for (const t of parsed.tasks) {
            if (seenUrls.has(t.taskResultUrl)) continue;
            seenUrls.add(t.taskResultUrl);
            const ref: TaskRef = {
              source: 'xcdemon',
              taskResultUrl: t.taskResultUrl,
              igcZipUrl: t.igcZipUrl,
              taskId: t.taskId,
              label: t.label,
              context: `${parsed.leagueName} · ${year}`,
            };
            appendFileSync(REFS_PATH, `${JSON.stringify(ref)}\n`);
            added += 1;
          }
        } catch (e) {
          errors.push(`XCDemon results ${league.leagueId}/${year}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  } catch (e) {
    errors.push(`XCDemon catalog: ${e instanceof Error ? e.message : e}`);
  }
  return added;
}

interface CivlEventsJson {
  events?: {
    id: number;
    eventLink: string;
    eventTitle: string;
    participantsCount: number | string;
  }[];
  totalCount?: number;
  pagesCount?: number;
  loadedCount?: number;
}

function civlEventsUrl(pastRange: string, page: number): string {
  const params = new URLSearchParams({
    'search[mode]': 'list',
    'search[dates]': 'past',
    'search[past]': pastRange,
    'search[page]': String(page),
  });
  return `${CIVL_BASE_URL}/events?${params.toString()}`;
}

async function collectCivlTasks(errors: string[], seenUrls: Set<string>): Promise<number> {
  let added = 0;
  try {
    const eventsHtml = await fetchText(`${CIVL_BASE_URL}/events`);
    maybeResetDom();
    const years = parseCivlYears(eventsHtml);

    for (const yearOpt of years) {
      let page = 0;
      let loadedCount = 0;
      let totalCount = 0;

      while (true) {
        let response: CivlEventsJson;
        try {
          response = await fetchJson<CivlEventsJson>(civlEventsUrl(yearOpt.pastRange, page), {
            'X-Requested-With': 'XMLHttpRequest',
          });
        } catch (e) {
          errors.push(`CIVL events JSON ${yearOpt.year} p${page}: ${e instanceof Error ? e.message : e}`);
          break;
        }

        const batch = response.events ?? [];
        for (const event of batch) {
          const count = event.participantsCount;
          if (count === '' || count === null || count === undefined) continue;

          const eventLink = event.eventLink.startsWith('http')
            ? event.eventLink
            : `${CIVL_BASE_URL}${event.eventLink.startsWith('/') ? '' : '/'}${event.eventLink}`;
          const resultsUrl = `${eventLink.replace(/\/$/, '')}/results`;

          try {
            let html = await fetchText(resultsUrl);
            const parsed = parseCivlResultsPage(html);
            html = '';
            maybeResetDom();
            if (parsed.tasks.length > 0) {
              console.error(
                `CIVL ${yearOpt.year}: ${parsed.eventName} → ${parsed.tasks.length} tasks (unique ${seenUrls.size})`,
              );
            }
            for (const t of parsed.tasks) {
              if (seenUrls.has(t.taskResultUrl)) continue;
              seenUrls.add(t.taskResultUrl);
              const ref: TaskRef = {
                source: 'civl',
                taskResultUrl: t.taskResultUrl,
                igcZipUrl: t.igcZipUrl,
                taskId: t.taskId,
                label: t.label,
                context: `${parsed.eventName} · ${yearOpt.year}`,
              };
              appendFileSync(REFS_PATH, `${JSON.stringify(ref)}\n`);
              added += 1;
            }
          } catch (e) {
            errors.push(`CIVL results ${resultsUrl}: ${e instanceof Error ? e.message : e}`);
          }
        }

        loadedCount += response.loadedCount ?? batch.length;
        totalCount = response.totalCount ?? loadedCount;
        const pagesCount = response.pagesCount ?? 0;
        if (totalCount <= loadedCount || pagesCount <= page + 1 || batch.length === 0) break;
        page += 1;
      }
    }
  } catch (e) {
    errors.push(`CIVL catalog: ${e instanceof Error ? e.message : e}`);
  }
  return added;
}

function loadRefsFromJsonl(): TaskRef[] {
  if (!existsSync(REFS_PATH)) return [];
  return readFileSync(REFS_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TaskRef);
}

async function forEachRef(callback: (ref: TaskRef, index: number) => Promise<void>): Promise<number> {
  if (!existsSync(REFS_PATH)) return 0;
  const rl = createInterface({ input: createReadStream(REFS_PATH), crlfDelay: Infinity });
  let index = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    index += 1;
    await callback(JSON.parse(line) as TaskRef, index);
  }
  return index;
}

function buildSummaryFromResults(results: TaskAuditResult[]): AuditReport['summary'] {
  const byCurrentParser: Record<string, number> = {};
  const byFixedParser: Record<string, number> = {};
  for (const r of results) {
    byCurrentParser[r.currentParser] = (byCurrentParser[r.currentParser] ?? 0) + 1;
    byFixedParser[r.fixedParser] = (byFixedParser[r.fixedParser] ?? 0) + 1;
  }

  const failCategories = new Map<
    FailureCategory,
    { count: number; urls: string[]; fix: string | null }
  >();

  for (const r of results) {
    if (r.currentParser === 'ok') continue;
    const key = r.currentParser;
    const entry = failCategories.get(key) ?? { count: 0, urls: [], fix: r.suggestedFix };
    entry.count += 1;
    if (entry.urls.length < 5) entry.urls.push(r.taskResultUrl);
    if (!entry.fix && r.suggestedFix) entry.fix = r.suggestedFix;
    failCategories.set(key, entry);
  }

  const failureCategories = [...failCategories.entries()]
    .map(([category, v]) => ({
      category,
      count: v.count,
      exampleUrls: v.urls,
      suggestedFix: v.fix,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalTasks: results.length,
    uniqueTaskUrls: results.length,
    byCurrentParser,
    byFixedParser,
    failureCategories,
  };
}

async function buildSummaryStreaming(): Promise<{
  summary: AuditReport['summary'];
  failureTasks: TaskAuditResult[];
}> {
  const byCurrentParser: Record<string, number> = {};
  const byFixedParser: Record<string, number> = {};
  const failCategories = new Map<
    FailureCategory,
    { count: number; urls: string[]; fix: string | null }
  >();
  const failureTasks: TaskAuditResult[] = [];
  let total = 0;

  if (!existsSync(RESULTS_PATH)) {
    return { summary: buildSummaryFromResults([]), failureTasks: [] };
  }

  const rl = createInterface({ input: createReadStream(RESULTS_PATH), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as TaskAuditResult;
    total += 1;
    byCurrentParser[r.currentParser] = (byCurrentParser[r.currentParser] ?? 0) + 1;
    byFixedParser[r.fixedParser] = (byFixedParser[r.fixedParser] ?? 0) + 1;
    if (r.currentParser !== 'ok') {
      if (failureTasks.length < 200) failureTasks.push(r);
      const key = r.currentParser;
      const entry = failCategories.get(key) ?? { count: 0, urls: [], fix: r.suggestedFix };
      entry.count += 1;
      if (entry.urls.length < 5) entry.urls.push(r.taskResultUrl);
      if (!entry.fix && r.suggestedFix) entry.fix = r.suggestedFix;
      failCategories.set(key, entry);
    }
  }

  const failureCategories = [...failCategories.entries()]
    .map(([category, v]) => ({
      category,
      count: v.count,
      exampleUrls: v.urls,
      suggestedFix: v.fix,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    summary: {
      totalTasks: total,
      uniqueTaskUrls: total,
      byCurrentParser,
      byFixedParser,
      failureCategories,
    },
    failureTasks,
  };
}

async function auditTask(ref: TaskRef): Promise<TaskAuditResult> {
  setupDom();
  let html: string;
  try {
    html = await fetchText(ref.taskResultUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      source: ref.source,
      taskResultUrl: ref.taskResultUrl,
      igcZipUrl: ref.igcZipUrl,
      label: ref.label,
      context: ref.context,
      igcZipPresent: Boolean(ref.igcZipUrl),
      currentParser: 'fetch_error',
      currentParserError: msg,
      turnpointCount: null,
      tableProbe: { found: false, headers: [], headerMatch: 'none', rowCount: 0 },
      fixedParser: 'fetch_error',
      fixedParserError: msg,
      fixedTurnpointCount: null,
      suggestedFix: null,
    };
  }

  const tableProbe = probeTurnpointTable(html);
  const current = tryParseCurrent(ref.source, html, ref);
  const fixed = tryParseFixed(ref.source, html);
  html = '';
  setupDom();

  let suggestedFix = fixed.suggestedFix;
  if (current.category !== 'ok' && fixed.category === 'ok') {
    suggestedFix = fixed.suggestedFix ?? suggestedFix;
  } else if (current.category === 'no_turnpoint_table' && tableProbe.headerMatch === 'partial') {
    suggestedFix =
      suggestedFix ??
      `Relax header check; closest headers: [${tableProbe.headers.join(', ')}]`;
  } else if (current.category === 'header_mismatch') {
    suggestedFix = `Headers seen: [${tableProbe.headers.join(', ')}]`;
  }

  return {
    source: ref.source,
    taskResultUrl: ref.taskResultUrl,
    igcZipUrl: ref.igcZipUrl,
    label: ref.label,
    context: ref.context,
    igcZipPresent: Boolean(ref.igcZipUrl),
    currentParser: current.category,
    currentParserError: current.error,
    turnpointCount: current.count,
    tableProbe,
    fixedParser: fixed.category,
    fixedParserError: fixed.error,
    fixedTurnpointCount: fixed.count,
    suggestedFix,
  };
}

function loadAuditedUrls(): Set<string> {
  const done = new Set<string>();
  if (!existsSync(RESULTS_PATH)) return done;
  const lines = readFileSync(RESULTS_PATH, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as TaskAuditResult;
      done.add(row.taskResultUrl);
    } catch {
      /* ignore partial line */
    }
  }
  return done;
}

async function main(): Promise<void> {
  const errors: string[] = [];
  const seenUrls = new Set<string>();

  if (!SKIP_COLLECT) {
    if (existsSync(REFS_PATH)) unlinkSync(REFS_PATH);
    if (existsSync(RESULTS_PATH)) unlinkSync(RESULTS_PATH);
    console.error('Collecting XCDemon tasks…');
    const xcdAdded = await collectXcdemonTasks(errors, seenUrls);
    console.error(`XCDemon unique tasks: ${xcdAdded}`);

    console.error('Collecting CIVL tasks…');
    const civlAdded = await collectCivlTasks(errors, seenUrls);
    console.error(`CIVL unique tasks added: ${civlAdded} (total unique ${seenUrls.size})`);
  } else {
    console.error('SKIP_COLLECT=1 — using existing refs file');
  }

  if (!RESUME_AUDIT && !SKIP_COLLECT && existsSync(RESULTS_PATH)) {
    unlinkSync(RESULTS_PATH);
  }
  const alreadyAudited = RESUME_AUDIT ? loadAuditedUrls() : new Set<string>();
  if (alreadyAudited.size > 0) {
    console.error(`Resuming audit — skipping ${alreadyAudited.size} URLs`);
  }

  let newAudits = 0;
  const total = await forEachRef(async (ref, i) => {
    const index = i - 1;
    if (AUDIT_LIMIT !== undefined) {
      if (index < AUDIT_OFFSET) return;
      if (index >= AUDIT_OFFSET + AUDIT_LIMIT) return;
    }
    if (alreadyAudited.has(ref.taskResultUrl)) return;
    if (MAX_NEW_AUDITS !== undefined && newAudits >= MAX_NEW_AUDITS) return;
    if (i % 25 === 0) console.error(`Auditing ${i}…`);
    const result = await auditTask(ref);
    appendFileSync(RESULTS_PATH, `${JSON.stringify(result)}\n`);
    newAudits += 1;
  });
  console.error(`Processed ${total} refs (${alreadyAudited.size} skipped, ${newAudits} new)`);

  if (WRITE_REPORT_ONLY) {
    console.error('WRITE_REPORT_ONLY — building report');
  } else if (AUDIT_LIMIT !== undefined || MAX_NEW_AUDITS !== undefined) {
    console.error('Batch slice done');
    return;
  }

  const summary = await buildSummaryStreaming();
  const tasks = existsSync(RESULTS_PATH)
    ? readFileSync(RESULTS_PATH, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as TaskAuditResult)
    : [];

  // Keep report smaller: full detail only for non-ok current parser
  const failedTasks = tasks.filter((t) => t.currentParser !== 'ok');

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    options: {
      delayMs: DELAY_MS,
      xcdemonLatestYearOnly: XCDEMON_LATEST_YEAR_ONLY,
      maxYearsPerLeague: MAX_YEARS_PER_LEAGUE,
    },
    summary,
    tasks: failedTasks,
    tasksOkCount: tasks.filter((t) => t.currentParser === 'ok').length,
    errors,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.error(`Wrote ${REPORT_PATH}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
