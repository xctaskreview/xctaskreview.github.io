import { buildOptimizedRoute, getTaskDisplayInfo } from './xctask';
import type { XcTask } from './types';

const DB_NAME = 'xc-task-review-history';
const DB_VERSION = 1;
const STORE_NAME = 'entries';
const MAX_HISTORY_ENTRIES = 100;

export interface TaskHistoryEntry {
  id: string;
  task: XcTask;
  taskFileName?: string;
  name: string;
  location: string | null;
  legCount: number;
  optimizedDistanceKm: number;
  pinned: boolean;
  createdAt: number;
  loadedAt: number;
}

export interface UpsertTaskHistoryInput {
  task: XcTask;
  taskFileName?: string;
  name?: string;
  location?: string | null;
}

export function normalizeTaskHistoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function taskHistoryIdFromName(name: string): string {
  return normalizeTaskHistoryName(name).toLowerCase() || 'task';
}

export function buildTaskHistorySummary(
  task: XcTask,
  taskFileName = '',
  location?: string | null,
): Pick<TaskHistoryEntry, 'name' | 'location' | 'legCount' | 'optimizedDistanceKm'> {
  const info = getTaskDisplayInfo(task, taskFileName);
  const route = buildOptimizedRoute(task);
  return {
    name: info.name || taskFileName || 'Task',
    location: location ?? info.embeddedLocation,
    legCount: route.progressLegDistances.length,
    optimizedDistanceKm: route.progressTotalDistance / 1000,
  };
}

function applyTaskDisplayFields(task: XcTask, name: string, location: string | null): XcTask {
  return {
    ...task,
    name,
    taskName: name,
    ...(location ? { location } : {}),
  };
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
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open task history database'));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const txDone = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Task history transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Task history transaction aborted'));
    });
    const result = await fn(store);
    await txDone;
    return result;
  } finally {
    db.close();
  }
}

function isValidHistoryEntry(value: unknown): value is TaskHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as TaskHistoryEntry;
  return (
    typeof entry.id === 'string' &&
    !!entry.task &&
    typeof entry.task === 'object' &&
    Array.isArray(entry.task.turnpoints) &&
    entry.task.turnpoints.length > 0 &&
    typeof entry.name === 'string' &&
    typeof entry.legCount === 'number' &&
    typeof entry.optimizedDistanceKm === 'number' &&
    typeof entry.pinned === 'boolean' &&
    typeof entry.createdAt === 'number' &&
    typeof entry.loadedAt === 'number'
  );
}

export function sortTaskHistoryEntries(entries: TaskHistoryEntry[]): TaskHistoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.loadedAt - a.loadedAt;
  });
}

export async function listTaskHistory(): Promise<TaskHistoryEntry[]> {
  try {
    const entries = await withStore('readonly', async (store) => {
      const values = await idbRequest(store.getAll());
      return values.filter(isValidHistoryEntry);
    });
    return sortTaskHistoryEntries(entries);
  } catch {
    return [];
  }
}

async function pruneHistory(store: IDBObjectStore): Promise<void> {
  const values = (await idbRequest(store.getAll())).filter(isValidHistoryEntry);
  if (values.length <= MAX_HISTORY_ENTRIES) return;

  const sorted = sortTaskHistoryEntries(values);
  const keepIds = new Set(sorted.slice(0, MAX_HISTORY_ENTRIES).map((entry) => entry.id));
  const removable = values
    .filter((entry) => !entry.pinned && !keepIds.has(entry.id))
    .sort((a, b) => a.loadedAt - b.loadedAt);

  let remaining = values.length;
  for (const entry of removable) {
    if (remaining <= MAX_HISTORY_ENTRIES) break;
    store.delete(entry.id);
    remaining -= 1;
  }
}

async function findEntryByName(
  store: IDBObjectStore,
  name: string,
): Promise<TaskHistoryEntry | null> {
  const id = taskHistoryIdFromName(name);
  const byId = await idbRequest(store.get(id));
  if (isValidHistoryEntry(byId)) return byId;

  const values = (await idbRequest(store.getAll())).filter(isValidHistoryEntry);
  return (
    values.find((entry) => taskHistoryIdFromName(entry.name) === id) ?? null
  );
}

export async function upsertTaskHistory(input: UpsertTaskHistoryInput): Promise<TaskHistoryEntry | null> {
  try {
    const summary = buildTaskHistorySummary(input.task, input.taskFileName ?? '', input.location);
    const name = normalizeTaskHistoryName(input.name ?? summary.name) || 'Task';
    const id = taskHistoryIdFromName(name);
    const location =
      input.location !== undefined ? (input.location?.trim() ? input.location.trim() : null) : summary.location;
    const now = Date.now();

    return await withStore('readwrite', async (store) => {
      const existing = await findEntryByName(store, name);
      const entry: TaskHistoryEntry = {
        id,
        task: applyTaskDisplayFields(input.task, name, location),
        taskFileName: input.taskFileName,
        name,
        location,
        legCount: summary.legCount,
        optimizedDistanceKm: summary.optimizedDistanceKm,
        pinned: existing?.pinned ?? false,
        createdAt: existing?.createdAt ?? now,
        loadedAt: now,
      };

      if (existing && existing.id !== id) {
        store.delete(existing.id);
      }
      store.put(entry);
      await pruneHistory(store);
      return entry;
    });
  } catch {
    return null;
  }
}

export async function updateTaskHistoryLocation(name: string, location: string): Promise<void> {
  try {
    const normalized = normalizeTaskHistoryName(name);
    if (!normalized) return;

    await withStore('readwrite', async (store) => {
      const existing = await findEntryByName(store, normalized);
      if (!existing) return;
      store.put({
        ...existing,
        location,
        task: applyTaskDisplayFields(existing.task, existing.name, location),
      });
    });
  } catch {
    // Ignore history location update failures.
  }
}

export async function setTaskHistoryPinned(id: string, pinned: boolean): Promise<TaskHistoryEntry | null> {
  try {
    return await withStore('readwrite', async (store) => {
      const existingRaw = await idbRequest(store.get(id));
      if (!isValidHistoryEntry(existingRaw)) return null;
      const entry = { ...existingRaw, pinned };
      store.put(entry);
      return entry;
    });
  } catch {
    return null;
  }
}

export async function deleteTaskHistoryEntry(id: string): Promise<void> {
  try {
    await withStore('readwrite', async (store) => {
      store.delete(id);
    });
  } catch {
    // Ignore history delete failures.
  }
}
