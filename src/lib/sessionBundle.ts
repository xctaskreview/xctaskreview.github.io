import JSZip from 'jszip';
import { serializeIgc } from './igc';
import { createDefaultPreferences, type AppPreferences } from './preferences';
import type { PersistedSession, PersistedView } from './persistedSession';
import { assignUniqueTrackColors, loadIgcFiles } from './tracks';
import type { FlightTrack, XcTask } from './types';
import { parseXcTask } from './xctask';

const BUNDLE_FORMAT = 'xc-task-review-session';
const BUNDLE_VERSION = 1;
const MANIFEST_NAME = 'manifest.json';
const TRACKS_DIR = 'tracks/';

interface SessionManifestTrack {
  fileName: string;
  zipPath: string;
  enabled: boolean;
  color?: string;
}

interface SessionManifest {
  format: typeof BUNDLE_FORMAT;
  version: typeof BUNDLE_VERSION;
  taskFileName: string;
  preferences: AppPreferences;
  view?: PersistedView;
  taskProgressMinimized?: boolean;
  taskProgressHeightPx?: number;
  playbackTimeMs?: number;
  playbackPlaying?: boolean;
  tracks: SessionManifestTrack[];
}

export interface SessionBundleImportResult {
  session: PersistedSession;
  warnings: string[];
}

function basename(fileName: string): string {
  return fileName.replace(/^.*[/\\]/, '');
}

function uniqueTrackZipPath(track: FlightTrack, usedPaths: Set<string>): string {
  const baseName = basename(track.fileName);
  let zipPath = `${TRACKS_DIR}${baseName}`;
  if (!usedPaths.has(zipPath.toLowerCase())) {
    usedPaths.add(zipPath.toLowerCase());
    return zipPath;
  }

  const stem = baseName.replace(/\.igc$/i, '');
  zipPath = `${TRACKS_DIR}${stem}-${track.id}.igc`;
  usedPaths.add(zipPath.toLowerCase());
  return zipPath;
}

function buildManifest(session: PersistedSession, tracks: SessionManifestTrack[]): SessionManifest {
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    taskFileName: session.taskFileName || 'task.xctsk',
    preferences: session.preferences,
    view: session.view,
    ...(session.taskProgressMinimized ? { taskProgressMinimized: true } : {}),
    ...(session.taskProgressHeightPx !== undefined
      ? { taskProgressHeightPx: session.taskProgressHeightPx }
      : {}),
    ...(session.playbackTimeMs !== undefined ? { playbackTimeMs: session.playbackTimeMs } : {}),
    ...(session.playbackPlaying !== undefined ? { playbackPlaying: session.playbackPlaying } : {}),
    tracks,
  };
}

function isValidManifest(value: unknown): value is SessionManifest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as SessionManifest;
  return (
    candidate.format === BUNDLE_FORMAT &&
    candidate.version === BUNDLE_VERSION &&
    typeof candidate.taskFileName === 'string' &&
    Array.isArray(candidate.tracks) &&
    candidate.preferences !== null &&
    typeof candidate.preferences === 'object'
  );
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function suggestSessionBundleFileName(taskFileName: string): string {
  const base = basename(taskFileName).replace(/\.(xctsk|json)$/i, '') || 'session';
  return `${base}-review.zip`;
}

export async function exportSessionBundle(session: PersistedSession): Promise<Blob> {
  const zip = new JSZip();
  const taskFileName = session.taskFileName || 'task.xctsk';
  zip.file(taskFileName, JSON.stringify(session.task, null, 2));

  const usedPaths = new Set<string>();
  const manifestTracks: SessionManifestTrack[] = session.tracks.map((track) => {
    const zipPath = uniqueTrackZipPath(track, usedPaths);
    zip.file(zipPath, serializeIgc(track));
    return {
      fileName: basename(track.fileName),
      zipPath,
      enabled: session.enabledTrackIds.includes(track.id),
      color: session.trackColors[track.id],
    };
  });

  zip.file(MANIFEST_NAME, JSON.stringify(buildManifest(session, manifestTracks), null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function downloadSessionBundle(session: PersistedSession): Promise<void> {
  const blob = await exportSessionBundle(session);
  downloadBlob(blob, suggestSessionBundleFileName(session.taskFileName || 'task.xctsk'));
}

async function readZipEntryText(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  if (!entry) {
    throw new Error(`Missing "${path}" in session bundle.`);
  }
  return entry.async('text');
}

function finalizeImportedSession(
  task: XcTask,
  taskFileName: string,
  tracks: FlightTrack[],
  manifest: SessionManifest,
): PersistedSession {
  const settingsByFileName = new Map(
    manifest.tracks.map((entry) => [entry.fileName.toLowerCase(), entry]),
  );
  const enabledTrackIds = tracks
    .filter((track) => settingsByFileName.get(basename(track.fileName).toLowerCase())?.enabled ?? true)
    .map((track) => track.id);
  const existingColors: Record<string, string> = {};

  for (const track of tracks) {
    const settings = settingsByFileName.get(basename(track.fileName).toLowerCase());
    if (settings?.color) {
      existingColors[track.id] = settings.color;
    }
  }

  return {
    task,
    taskFileName,
    tracks,
    enabledTrackIds:
      tracks.length === 0
        ? []
        : enabledTrackIds.length > 0
          ? enabledTrackIds
          : tracks.map((track) => track.id),
    trackColors: assignUniqueTrackColors(tracks, existingColors),
    preferences: { ...createDefaultPreferences(), ...manifest.preferences },
    view: manifest.view,
    ...(manifest.taskProgressMinimized ? { taskProgressMinimized: true } : {}),
    ...(typeof manifest.taskProgressHeightPx === 'number' &&
    Number.isFinite(manifest.taskProgressHeightPx)
      ? { taskProgressHeightPx: Math.round(manifest.taskProgressHeightPx) }
      : {}),
    ...(typeof manifest.playbackTimeMs === 'number' && Number.isFinite(manifest.playbackTimeMs)
      ? { playbackTimeMs: Math.round(manifest.playbackTimeMs) }
      : {}),
    ...(manifest.playbackPlaying === true || manifest.playbackPlaying === false
      ? { playbackPlaying: manifest.playbackPlaying }
      : {}),
  };
}

export async function importSessionBundle(file: File): Promise<SessionBundleImportResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestRaw = zip.file(MANIFEST_NAME);
  if (!manifestRaw) {
    throw new Error('Not a valid session bundle: missing manifest.json.');
  }

  const manifest = JSON.parse(await manifestRaw.async('text')) as unknown;
  if (!isValidManifest(manifest)) {
    throw new Error('Not a valid session bundle: unsupported manifest.');
  }

  const taskText = await readZipEntryText(zip, manifest.taskFileName);
  const task = parseXcTask(taskText);

  const igcFiles: File[] = [];
  for (const entry of manifest.tracks) {
    const igcText = await readZipEntryText(zip, entry.zipPath);
    igcFiles.push(new File([igcText], entry.fileName, { type: 'text/plain' }));
  }

  const { tracks, errors } = await loadIgcFiles(igcFiles);
  if (tracks.length === 0) {
    throw new Error(errors[0] ?? 'Session bundle contains no readable IGC tracklogs.');
  }

  return {
    session: finalizeImportedSession(task, manifest.taskFileName, tracks, manifest),
    warnings: errors,
  };
}
