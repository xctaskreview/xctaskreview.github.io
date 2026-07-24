import { getTrackEndTime, sanitizeTrackPointAltitudes } from './geo';
import { parseGliderTypeFromHeader } from './igc';
import type { AppPreferences } from './preferences';
import { normalizePreferences } from './preferences';
import type { FlightTrack, XcTask } from './types';

const DB_NAME = 'xc-task-review';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const SESSION_ID = 'current';
const TRACK_KEY_PREFIX = 'track:';
const LEGACY_STORAGE_KEY = 'xc-task-review-session';
const STORAGE_VERSION_V1 = 1;
const STORAGE_VERSION_V2 = 2;

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

interface StoredFlightTrackV2 {
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
}

export type SaveSessionResult = 'saved' | 'partial' | 'failed';

function trackStorageKey(trackId: string): string {
  return `${TRACK_KEY_PREFIX}${trackId}`;
}

function isTrackStorageKey(key: IDBValidKey): key is string {
  return typeof key === 'string' && key.startsWith(TRACK_KEY_PREFIX);
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
  };
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

async function deleteTrackKeysExcept(keepTrackIds: Set<string>): Promise<void> {
  const keys = await idbGetAllKeys();
  const deletes = keys
    .filter(isTrackStorageKey)
    .filter((key) => !keepTrackIds.has(key.slice(TRACK_KEY_PREFIX.length)));

  if (deletes.length === 0) return;
  await idbWriteBatch([], deletes);
}

async function deleteAllTrackKeys(): Promise<void> {
  const keys = await idbGetAllKeys();
  const deletes = keys.filter(isTrackStorageKey);
  if (deletes.length === 0) return;
  await idbWriteBatch([], deletes);
}

async function loadSplitSession(meta: StoredSessionPayloadV2Split): Promise<PersistedSession | null> {
  const storedTracks = await Promise.all(
    meta.trackIds.map(async (trackId) => idbGet<StoredFlightTrackV2>(trackStorageKey(trackId))),
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
  );
}

async function loadStoredSessionRecord(record: StoredSessionRecord): Promise<PersistedSession | null> {
  if (isValidStoredSessionV2Split(record)) {
    return loadSplitSession(record);
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
  };
}

async function trySaveMonolithic(session: PersistedSession): Promise<boolean> {
  const payload = buildMonolithicPayload(session);
  const keepTrackIds = new Set(session.tracks.map((track) => track.id));

  try {
    await idbWriteBatch([{ key: SESSION_ID, value: payload }]);
    await deleteTrackKeysExcept(keepTrackIds);
    return true;
  } catch {
    return false;
  }
}

async function trySaveSplit(session: PersistedSession): Promise<boolean> {
  const serializedTracks = session.tracks.map(serializeTrackV2);
  const keepTrackIds = new Set(serializedTracks.map((track) => track.id));
  const trackIds = serializedTracks.map((track) => track.id);
  const meta = buildSplitMeta(session, trackIds);

  try {
    await idbWriteBatch([
      ...serializedTracks.map((track) => ({ key: trackStorageKey(track.id), value: track })),
      { key: SESSION_ID, value: meta },
    ]);
    await deleteTrackKeysExcept(keepTrackIds);
    return true;
  } catch {
    return false;
  }
}

async function trySaveMetaOnly(session: PersistedSession): Promise<boolean> {
  const meta = buildSplitMeta(session, []);

  try {
    await deleteAllTrackKeys();
    await idbWriteBatch([{ key: SESSION_ID, value: meta }]);
    return true;
  } catch {
    return false;
  }
}

export async function loadPersistedSession(): Promise<PersistedSession | null> {
  try {
    const stored = await idbGet<StoredSessionRecord>(SESSION_ID);
    if (stored) {
      const session = await loadStoredSessionRecord(stored);
      if (session) return session;
    }

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

async function performSave(session: PersistedSession | null): Promise<SaveSessionResult> {
  try {
    if (!session) {
      await clearPersistedSession();
      return 'saved';
    }

    if (await trySaveMonolithic(session)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return 'saved';
    }

    if (await trySaveSplit(session)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return 'saved';
    }

    if (await trySaveMetaOnly(session)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return 'partial';
    }

    return 'failed';
  } catch {
    return 'failed';
  }
}

export function savePersistedSession(session: PersistedSession | null): Promise<SaveSessionResult> {
  const next = saveQueue.then(() => performSave(session));
  saveQueue = next.catch(() => 'failed' as SaveSessionResult);
  return next;
}

export async function clearPersistedSession(): Promise<void> {
  try {
    const keys = await idbGetAllKeys();
    const deletes = keys.filter((key) => key === SESSION_ID || isTrackStorageKey(key));
    if (deletes.length > 0) {
      await idbWriteBatch([], deletes);
    }
  } catch {
    try {
      await idbWriteBatch([], [SESSION_ID]);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
