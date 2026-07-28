import { getTrackEndTime, sanitizeTrackPointAltitudes } from './geo';
import { parseGliderTypeFromHeader } from './igc';
import type { AppPreferences } from './preferences';
import { normalizePreferences } from './preferences';
import type { FlightTrack, XcTask } from './types';

const DB_NAME = 'xc-task-review';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const LEGACY_SESSION_ID = 'current';
const SESSION_KEY_PREFIX = 'session:';
const TRACK_KEY_PREFIX = 'track:';
const LEGACY_STORAGE_KEY = 'xc-task-review-session';
const TAB_ID_STORAGE_KEY = 'xc-task-review-tab-id';
const TAB_REGISTRY_KEY = 'xc-task-review-tab-registry';
const STORAGE_VERSION_V1 = 1;
const STORAGE_VERSION_V2 = 2;
const TAB_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const TAB_HEARTBEAT_MS = 30_000;

export type PersistedView = 'welcome' | 'review';

interface StoredTrackPointV1 {
  time: string;
  lat: number;
  lon: number;
  alt: number;
}

interface StoredFlightTrackV1 {
  id: string;
  pilotName: string;
  fileName: string;
  points: StoredTrackPointV1[];
  date?: string;
  finishTime?: string;
  landingTime?: string;
  gliderType?: string;
  igcHeader?: string;
}

export interface StoredFlightTrackV2 {
  id: string;
  pilotName: string;
  fileName: string;
  date?: number;
  finishTime?: number;
  gliderType?: string;
  times: number[];
  lats: number[];
  lons: number[];
  alts: number[];
}

interface StoredSessionPayloadV1 {
  version: typeof STORAGE_VERSION_V1;
  task: XcTask;
  taskFileName?: string;
  tracks: StoredFlightTrackV1[];
  enabledTrackIds: string[];
  trackColors: Record<string, string>;
  preferences: AppPreferences;
  view?: PersistedView;
  taskProgressMinimized?: boolean;
  taskProgressHeightPx?: number;
  playbackTimeMs?: number;
}

interface StoredSessionPayloadV2Monolithic {
  version: typeof STORAGE_VERSION_V2;
  storage: 'monolithic';
  task: XcTask;
  taskFileName?: string;
  tracks: StoredFlightTrackV2[];
  enabledTrackIds: string[];
  trackColors: Record<string, string>;
  preferences: AppPreferences;
  view?: PersistedView;
  taskProgressMinimized?: boolean;
  taskProgressHeightPx?: number;
  playbackTimeMs?: number;
}

interface StoredSessionPayloadV2Split {
  version: typeof STORAGE_VERSION_V2;
  storage: 'split';
  task: XcTask;
  taskFileName?: string;
  trackIds: string[];
  enabledTrackIds: string[];
  trackColors: Record<string, string>;
  preferences: AppPreferences;
  view?: PersistedView;
  taskProgressMinimized?: boolean;
  taskProgressHeightPx?: number;
  playbackTimeMs?: number;
}

type StoredSessionRecord =
  | StoredSessionPayloadV1
  | StoredSessionPayloadV2Monolithic
  | StoredSessionPayloadV2Split;

export interface PersistedSession {
  task: XcTask;
  taskFileName?: string;
  tracks: FlightTrack[];
  enabledTrackIds: string[];
  trackColors: Record<string, string>;
  preferences: AppPreferences;
  view?: PersistedView;
  taskProgressMinimized?: boolean;
  taskProgressHeightPx?: number;
  /** Playback clock while in review; omitted on welcome. */
  playbackTimeMs?: number;
}

export type SaveSessionResult = 'saved' | 'partial' | 'failed';

type TabRegistry = Record<string, number>;

function createTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getTabId(): string {
  try {
    const existing = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
    if (existing) return existing;

    const tabId = createTabId();
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, tabId);
    return tabId;
  } catch {
    return createTabId();
  }
}

function sessionStorageKey(tabId: string): string {
  return `${SESSION_KEY_PREFIX}${tabId}`;
}

function trackStorageKey(tabId: string, trackId: string): string {
  return `${TRACK_KEY_PREFIX}${tabId}:${trackId}`;
}

function legacyTrackStorageKey(trackId: string): string {
  return `${TRACK_KEY_PREFIX}${trackId}`;
}

function isSessionStorageKey(key: IDBValidKey): key is string {
  return typeof key === 'string' && key.startsWith(SESSION_KEY_PREFIX);
}

function isTabTrackStorageKey(tabId: string, key: IDBValidKey): key is string {
  return typeof key === 'string' && key.startsWith(`${TRACK_KEY_PREFIX}${tabId}:`);
}

function tabIdFromSessionKey(key: string): string {
  return key.slice(SESSION_KEY_PREFIX.length);
}

function readTabRegistry(): TabRegistry {
  try {
    const raw = localStorage.getItem(TAB_REGISTRY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const registry: TabRegistry = {};
    for (const [tabId, timestamp] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
        registry[tabId] = timestamp;
      }
    }
    return registry;
  } catch {
    return {};
  }
}

function writeTabRegistry(registry: TabRegistry): void {
  try {
    localStorage.setItem(TAB_REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // Ignore registry write failures.
  }
}

function touchTab(tabId: string): void {
  const registry = readTabRegistry();
  registry[tabId] = Date.now();
  writeTabRegistry(registry);
}

let heartbeatStarted = false;

function ensureTabHeartbeat(tabId: string): void {
  if (heartbeatStarted || typeof window === 'undefined') return;
  heartbeatStarted = true;
  touchTab(tabId);
  window.setInterval(() => touchTab(tabId), TAB_HEARTBEAT_MS);
  window.addEventListener('pagehide', () => touchTab(tabId));
}

function serializeTrackV2(track: FlightTrack): StoredFlightTrackV2 {
  const times: number[] = [];
  const lats: number[] = [];
  const lons: number[] = [];
  const alts: number[] = [];

  for (const point of track.points) {
    times.push(point.time.getTime());
    lats.push(point.lat);
    lons.push(point.lon);
    alts.push(point.alt);
  }

  return {
    id: track.id,
    pilotName: track.pilotName,
    fileName: track.fileName,
    date: track.date?.getTime(),
    finishTime: track.finishTime?.getTime(),
    gliderType: track.gliderType,
    times,
    lats,
    lons,
    alts,
  };
}

function deserializeTrackV2(track: StoredFlightTrackV2): FlightTrack {
  const pointCount = Math.min(track.times.length, track.lats.length, track.lons.length, track.alts.length);
  const points = sanitizeTrackPointAltitudes(
    Array.from({ length: pointCount }, (_, index) => ({
      time: new Date(track.times[index]),
      lat: track.lats[index],
      lon: track.lons[index],
      alt: track.alts[index],
    })),
  );

  return {
    id: track.id,
    pilotName: track.pilotName,
    fileName: track.fileName,
    points,
    date: track.date !== undefined ? new Date(track.date) : undefined,
    finishTime: track.finishTime !== undefined ? new Date(track.finishTime) : undefined,
    landingTime: getTrackEndTime(points),
    gliderType: track.gliderType,
  };
}

function deserializeTrackV1(track: StoredFlightTrackV1): FlightTrack {
  const points = sanitizeTrackPointAltitudes(
    track.points.map((point) => ({
      time: new Date(point.time),
      lat: point.lat,
      lon: point.lon,
      alt: point.alt,
    })),
  );

  return {
    id: track.id,
    pilotName: track.pilotName,
    fileName: track.fileName,
    points,
    date: track.date ? new Date(track.date) : undefined,
    finishTime: track.finishTime ? new Date(track.finishTime) : undefined,
    landingTime: getTrackEndTime(points),
    igcHeader: track.igcHeader,
    gliderType: track.gliderType ?? parseGliderTypeFromHeader(track.igcHeader ?? ''),
  };
}

function isValidView(view: unknown): view is PersistedView {
  return view === 'welcome' || view === 'review';
}

function isValidTask(task: unknown): task is XcTask {
  if (!task || typeof task !== 'object') return false;
  const candidate = task as XcTask;
  return Array.isArray(candidate.turnpoints) && candidate.turnpoints.length > 0;
}

function isValidTrackV1(track: unknown): track is StoredFlightTrackV1 {
  if (!track || typeof track !== 'object') return false;
  const candidate = track as StoredFlightTrackV1;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.pilotName === 'string' &&
    Array.isArray(candidate.points) &&
    candidate.points.length > 0
  );
}

function isValidTrackV2(track: unknown): track is StoredFlightTrackV2 {
  if (!track || typeof track !== 'object') return false;
  const candidate = track as StoredFlightTrackV2;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.pilotName === 'string' &&
    Array.isArray(candidate.times) &&
    Array.isArray(candidate.lats) &&
    Array.isArray(candidate.lons) &&
    Array.isArray(candidate.alts) &&
    candidate.times.length > 0 &&
    candidate.times.length === candidate.lats.length &&
    candidate.times.length === candidate.lons.length &&
    candidate.times.length === candidate.alts.length
  );
}

function isValidStoredSessionV1(value: unknown): value is StoredSessionPayloadV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as StoredSessionPayloadV1;
  if (candidate.version !== STORAGE_VERSION_V1) return false;
  if (!isValidTask(candidate.task)) return false;
  if (!Array.isArray(candidate.tracks)) return false;
  if (!Array.isArray(candidate.enabledTrackIds)) return false;
  if (!candidate.trackColors || typeof candidate.trackColors !== 'object') return false;
  if (!candidate.preferences || typeof candidate.preferences !== 'object') return false;
  return candidate.tracks.every(isValidTrackV1);
}

function isValidStoredSessionV2Monolithic(value: unknown): value is StoredSessionPayloadV2Monolithic {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as StoredSessionPayloadV2Monolithic;
  if (candidate.version !== STORAGE_VERSION_V2 || candidate.storage !== 'monolithic') return false;
  if (!isValidTask(candidate.task)) return false;
  if (!Array.isArray(candidate.tracks)) return false;
  if (!Array.isArray(candidate.enabledTrackIds)) return false;
  if (!candidate.trackColors || typeof candidate.trackColors !== 'object') return false;
  if (!candidate.preferences || typeof candidate.preferences !== 'object') return false;
  return candidate.tracks.every(isValidTrackV2);
}

function isValidStoredSessionV2Split(value: unknown): value is StoredSessionPayloadV2Split {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as StoredSessionPayloadV2Split;
  if (candidate.version !== STORAGE_VERSION_V2 || candidate.storage !== 'split') return false;
  if (!isValidTask(candidate.task)) return false;
  if (!Array.isArray(candidate.trackIds)) return false;
  if (!Array.isArray(candidate.enabledTrackIds)) return false;
  if (!candidate.trackColors || typeof candidate.trackColors !== 'object') return false;
  if (!candidate.preferences || typeof candidate.preferences !== 'object') return false;
  return candidate.trackIds.every((id) => typeof id === 'string');
}

function finalizeSession(
  task: XcTask,
  taskFileName: string | undefined,
  tracks: FlightTrack[],
  enabledTrackIds: string[],
  trackColors: Record<string, string>,
  preferences: AppPreferences,
  view?: PersistedView,
  taskProgressMinimized?: boolean,
  taskProgressHeightPx?: number,
  playbackTimeMs?: number,
): PersistedSession {
  const trackIds = new Set(tracks.map((track) => track.id));
  const enabled = enabledTrackIds.filter((id) => trackIds.has(id));

  return {
    task,
    taskFileName,
    tracks,
    enabledTrackIds:
      tracks.length === 0 ? [] : enabled.length > 0 ? enabled : tracks.map((track) => track.id),
    trackColors,
    preferences: normalizePreferences(preferences),
    ...(view ? { view } : {}),
    ...(taskProgressMinimized ? { taskProgressMinimized: true } : {}),
    ...(typeof taskProgressHeightPx === 'number' && Number.isFinite(taskProgressHeightPx)
      ? { taskProgressHeightPx: Math.round(taskProgressHeightPx) }
      : {}),
    ...(typeof playbackTimeMs === 'number' && Number.isFinite(playbackTimeMs)
      ? { playbackTimeMs: Math.round(playbackTimeMs) }
      : {}),
  };
}

function readStoredTaskProgressHeightPx(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value);
}

function readStoredPlaybackTimeMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value);
}

function deserializeMonolithicSession(
  payload: StoredSessionPayloadV1 | StoredSessionPayloadV2Monolithic,
): PersistedSession {
  const tracks =
    payload.version === STORAGE_VERSION_V1
      ? payload.tracks.map(deserializeTrackV1)
      : payload.tracks.map(deserializeTrackV2);

  return finalizeSession(
    payload.task,
    payload.taskFileName,
    tracks,
    payload.enabledTrackIds,
    payload.trackColors,
    payload.preferences,
    isValidView(payload.view) ? payload.view : undefined,
    payload.taskProgressMinimized === true,
    readStoredTaskProgressHeightPx(payload.taskProgressHeightPx),
    readStoredPlaybackTimeMs(payload.playbackTimeMs),
  );
}

function loadLegacyLocalStorageSession(): StoredSessionPayloadV1 | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isValidStoredSessionV1(parsed)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDatabase().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(key);

        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => reject(request.error ?? new Error('Failed to read session'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      }),
  );
}

function idbGetAllKeys(): Promise<IDBValidKey[]> {
  return openDatabase().then(
    (db) =>
      new Promise<IDBValidKey[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).getAllKeys();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to list session keys'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      }),
  );
}

function idbWriteBatch(writes: Array<{ key: string; value: unknown }>, deletes: string[] = []): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        for (const key of deletes) {
          store.delete(key);
        }
        for (const entry of writes) {
          store.put(entry.value, entry.key);
        }

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Failed to write session batch'));
        };
      }),
  );
}

async function deleteTabTrackKeysExcept(tabId: string, keepTrackIds: Set<string>): Promise<void> {
  const keys = await idbGetAllKeys();
  const deletes = keys
    .filter((key) => isTabTrackStorageKey(tabId, key))
    .filter((key) => !keepTrackIds.has(key.slice(`${TRACK_KEY_PREFIX}${tabId}:`.length)));

  if (deletes.length === 0) return;
  await idbWriteBatch([], deletes);
}

async function deleteTabData(tabId: string): Promise<void> {
  const keys = await idbGetAllKeys();
  const deletes = keys.filter(
    (key) => key === sessionStorageKey(tabId) || isTabTrackStorageKey(tabId, key),
  );
  if (deletes.length === 0) return;
  await idbWriteBatch([], deletes);
}

async function pruneStaleTabs(currentTabId: string): Promise<void> {
  const registry = readTabRegistry();
  const now = Date.now();
  const keys = await idbGetAllKeys();
  const sessionTabIds = new Set(
    keys.filter(isSessionStorageKey).map((key) => tabIdFromSessionKey(key)),
  );

  const staleTabIds = new Set<string>();
  for (const [tabId, lastSeen] of Object.entries(registry)) {
    if (tabId === currentTabId) continue;
    if (now - lastSeen > TAB_STALE_MS) {
      staleTabIds.add(tabId);
    }
  }
  for (const tabId of sessionTabIds) {
    if (tabId === currentTabId) continue;
    const lastSeen = registry[tabId];
    if (lastSeen === undefined || now - lastSeen > TAB_STALE_MS) {
      staleTabIds.add(tabId);
    }
  }

  if (staleTabIds.size === 0) return;

  for (const tabId of staleTabIds) {
    await deleteTabData(tabId);
    delete registry[tabId];
  }
  writeTabRegistry(registry);
}

async function loadSplitSession(
  meta: StoredSessionPayloadV2Split,
  trackKeyForId: (trackId: string) => string,
): Promise<PersistedSession | null> {
  const storedTracks = await Promise.all(
    meta.trackIds.map(async (trackId) => idbGet<StoredFlightTrackV2>(trackKeyForId(trackId))),
  );

  const tracks = storedTracks.flatMap((track) => (track && isValidTrackV2(track) ? [deserializeTrackV2(track)] : []));

  if (meta.trackIds.length > 0 && tracks.length === 0) {
    return null;
  }

  return finalizeSession(
    meta.task,
    meta.taskFileName,
    tracks,
    meta.enabledTrackIds,
    meta.trackColors,
    meta.preferences,
    isValidView(meta.view) ? meta.view : undefined,
    meta.taskProgressMinimized === true,
    readStoredTaskProgressHeightPx(meta.taskProgressHeightPx),
    readStoredPlaybackTimeMs(meta.playbackTimeMs),
  );
}

async function loadStoredSessionRecord(
  tabId: string,
  record: StoredSessionRecord,
  trackKeyForId: (trackId: string) => string = (trackId) => trackStorageKey(tabId, trackId),
): Promise<PersistedSession | null> {
  if (isValidStoredSessionV2Split(record)) {
    return loadSplitSession(record, trackKeyForId);
  }

  if (isValidStoredSessionV2Monolithic(record) || isValidStoredSessionV1(record)) {
    return deserializeMonolithicSession(record);
  }

  return null;
}

function buildMonolithicPayload(session: PersistedSession): StoredSessionPayloadV2Monolithic {
  return {
    version: STORAGE_VERSION_V2,
    storage: 'monolithic',
    task: session.task,
    taskFileName: session.taskFileName,
    tracks: session.tracks.map(serializeTrackV2),
    enabledTrackIds: session.enabledTrackIds,
    trackColors: session.trackColors,
    preferences: session.preferences,
    view: session.view,
    ...(session.taskProgressMinimized ? { taskProgressMinimized: true } : {}),
    ...(session.taskProgressHeightPx !== undefined
      ? { taskProgressHeightPx: session.taskProgressHeightPx }
      : {}),
    ...(session.playbackTimeMs !== undefined ? { playbackTimeMs: session.playbackTimeMs } : {}),
  };
}

function buildSplitMeta(session: PersistedSession, trackIds: string[]): StoredSessionPayloadV2Split {
  return {
    version: STORAGE_VERSION_V2,
    storage: 'split',
    task: session.task,
    taskFileName: session.taskFileName,
    trackIds,
    enabledTrackIds: session.enabledTrackIds,
    trackColors: session.trackColors,
    preferences: session.preferences,
    view: session.view,
    ...(session.taskProgressMinimized ? { taskProgressMinimized: true } : {}),
    ...(session.taskProgressHeightPx !== undefined
      ? { taskProgressHeightPx: session.taskProgressHeightPx }
      : {}),
    ...(session.playbackTimeMs !== undefined ? { playbackTimeMs: session.playbackTimeMs } : {}),
  };
}

async function trySaveMonolithic(tabId: string, session: PersistedSession): Promise<boolean> {
  const payload = buildMonolithicPayload(session);
  const keepTrackIds = new Set(session.tracks.map((track) => track.id));

  try {
    await idbWriteBatch([{ key: sessionStorageKey(tabId), value: payload }]);
    await deleteTabTrackKeysExcept(tabId, keepTrackIds);
    return true;
  } catch {
    return false;
  }
}

async function trySaveSplit(tabId: string, session: PersistedSession): Promise<boolean> {
  const serializedTracks = session.tracks.map(serializeTrackV2);
  const keepTrackIds = new Set(serializedTracks.map((track) => track.id));
  const trackIds = serializedTracks.map((track) => track.id);
  const meta = buildSplitMeta(session, trackIds);

  try {
    await idbWriteBatch([
      ...serializedTracks.map((track) => ({
        key: trackStorageKey(tabId, track.id),
        value: track,
      })),
      { key: sessionStorageKey(tabId), value: meta },
    ]);
    await deleteTabTrackKeysExcept(tabId, keepTrackIds);
    return true;
  } catch {
    return false;
  }
}

async function trySaveMetaOnly(tabId: string, session: PersistedSession): Promise<boolean> {
  const meta = buildSplitMeta(session, []);

  try {
    await deleteTabTrackKeysExcept(tabId, new Set());
    await idbWriteBatch([{ key: sessionStorageKey(tabId), value: meta }]);
    return true;
  } catch {
    return false;
  }
}

const LEGACY_SESSION_OWNER_KEY = 'xc-task-review-legacy-owner';

function claimLegacySharedSession(tabId: string): boolean {
  try {
    const owner = localStorage.getItem(LEGACY_SESSION_OWNER_KEY);
    if (owner === tabId) return true;
    if (owner) return false;
    localStorage.setItem(LEGACY_SESSION_OWNER_KEY, tabId);
    return localStorage.getItem(LEGACY_SESSION_OWNER_KEY) === tabId;
  } catch {
    return true;
  }
}

async function migrateLegacySharedSession(tabId: string): Promise<PersistedSession | null> {
  if (!claimLegacySharedSession(tabId)) return null;

  const stored = await idbGet<StoredSessionRecord>(LEGACY_SESSION_ID);
  if (!stored) return null;

  const session = await loadStoredSessionRecord(tabId, stored, legacyTrackStorageKey);
  if (!session) {
    await idbWriteBatch([], [LEGACY_SESSION_ID]);
    return null;
  }

  // Claim the shared legacy session for this tab so other tabs start empty.
  const saveResult = await performSaveForTab(tabId, session);
  if (saveResult === 'failed') {
    return session;
  }

  const keys = await idbGetAllKeys();
  const legacyTrackDeletes = keys.filter((key): key is string => {
    if (typeof key !== 'string' || !key.startsWith(TRACK_KEY_PREFIX)) return false;
    if (key.startsWith(`${TRACK_KEY_PREFIX}${tabId}:`)) return false;
    // Legacy split tracks use `track:<id>` with no extra colon in the key suffix.
    return !key.slice(TRACK_KEY_PREFIX.length).includes(':');
  });
  await idbWriteBatch([], [LEGACY_SESSION_ID, ...legacyTrackDeletes]);
  return session;
}

export async function loadPersistedSession(): Promise<PersistedSession | null> {
  const tabId = getTabId();
  ensureTabHeartbeat(tabId);

  try {
    touchTab(tabId);
    await pruneStaleTabs(tabId);

    const stored = await idbGet<StoredSessionRecord>(sessionStorageKey(tabId));
    if (stored) {
      const session = await loadStoredSessionRecord(tabId, stored);
      if (session) return session;
    }

    const migrated = await migrateLegacySharedSession(tabId);
    if (migrated) return migrated;

    const legacy = loadLegacyLocalStorageSession();
    if (!legacy) return null;

    const session = deserializeMonolithicSession(legacy);
    await savePersistedSession(session);
    return session;
  } catch {
    const legacy = loadLegacyLocalStorageSession();
    return legacy ? deserializeMonolithicSession(legacy) : null;
  }
}

let saveQueue: Promise<SaveSessionResult> = Promise.resolve('saved');

async function performSaveForTab(tabId: string, session: PersistedSession | null): Promise<SaveSessionResult> {
  try {
    if (!session) {
      await deleteTabData(tabId);
      return 'saved';
    }

    touchTab(tabId);

    if (await trySaveMonolithic(tabId, session)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return 'saved';
    }

    if (await trySaveSplit(tabId, session)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return 'saved';
    }

    if (await trySaveMetaOnly(tabId, session)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return 'partial';
    }

    return 'failed';
  } catch {
    return 'failed';
  }
}

async function performSave(session: PersistedSession | null): Promise<SaveSessionResult> {
  return performSaveForTab(getTabId(), session);
}

export function serializeFlightTrackForPersistence(track: FlightTrack): StoredFlightTrackV2 {
  return serializeTrackV2(track);
}

export function deserializeFlightTrackFromPersistence(track: StoredFlightTrackV2): FlightTrack {
  return deserializeTrackV2(track);
}

export function isValidPersistedFlightTrack(track: unknown): track is StoredFlightTrackV2 {
  return isValidTrackV2(track);
}

export function savePersistedSession(session: PersistedSession | null): Promise<SaveSessionResult> {
  const next = saveQueue.then(() => performSave(session));
  saveQueue = next.catch(() => 'failed' as SaveSessionResult);
  return next;
}

export async function clearPersistedSession(): Promise<void> {
  const tabId = getTabId();
  try {
    await deleteTabData(tabId);
  } catch {
    try {
      await idbWriteBatch([], [sessionStorageKey(tabId)]);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
