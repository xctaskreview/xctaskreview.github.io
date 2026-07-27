import JSZip from 'jszip';
import type { FlightTrack, TaskTiming, XcTask } from './types';
import { getTaskStartGate, getTaskStartTime, taskStartGateIncludesSeconds } from './xctask';
import { parseIgc } from './igc';
import { COMPETITOR_COLORS } from './geo';
import {
  enrichTracksWithTaskProgress,
  getTrackSnapshotAtTime,
  type EnrichedFlightTrack,
} from './taskProgress';
import { getPilotSpeedSectionFinishTime } from './taskVerification';

export { enrichTracksWithTaskProgress, getTrackSnapshotAtTime, type EnrichedFlightTrack };
export {
  computeGlobalLegStatistics,
  computePilotLegTimings,
  type GlobalLegStatistics,
  type PilotLegTiming,
} from './legStatistics';

export interface LoadIgcResult {
  tracks: FlightTrack[];
  errors: string[];
}

export async function loadIgcFiles(files: File[]): Promise<LoadIgcResult> {
  const tracks: FlightTrack[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.igc')) {
      try {
        tracks.push(parseIgc(await file.text(), file.name));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Failed to load ${file.name}`);
      }
    } else if (lower.endsWith('.zip')) {
      const zipResult = await loadIgcZip(file);
      tracks.push(...zipResult.tracks);
      errors.push(...zipResult.errors);
    }
  }

  return {
    tracks: tracks.sort((a, b) => a.pilotName.localeCompare(b.pilotName)),
    errors,
  };
}

async function loadIgcZip(file: File): Promise<LoadIgcResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const tracks: FlightTrack[] = [];
  const errors: string[] = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.toLowerCase().endsWith('.igc')) continue;
    const fileName = path.split('/').pop() ?? path;
    try {
      const text = await entry.async('text');
      tracks.push(parseIgc(text, fileName));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Failed to load ${fileName}`);
    }
  }

  return { tracks, errors };
}

export function computeTaskTiming(task: XcTask, tracks: EnrichedFlightTrack[]): TaskTiming {
  if (tracks.length === 0) {
    const now = new Date();
    return { trackStart: now, trackEnd: now };
  }

  const trackStart = new Date(Math.min(...tracks.map((t) => t.points[0].time.getTime())));
  const trackEnd = new Date(Math.max(...tracks.map((t) => t.points[t.points.length - 1].time.getTime())));
  const referenceDate = tracks.find((t) => t.date)?.date ?? trackStart;
  const taskStart = getTaskStartTime(task, referenceDate);

  const finished = tracks
    .map((track) => ({ track, finishTime: getPilotSpeedSectionFinishTime(track) }))
    .filter((entry): entry is { track: EnrichedFlightTrack; finishTime: Date } => entry.finishTime !== undefined);
  let fastestFinish: Date | undefined;
  let fastestPilot: string | undefined;

  if (finished.length > 0) {
    const fastest = finished.reduce((best, current) =>
      current.finishTime.getTime() < best.finishTime.getTime() ? current : best,
    );
    fastestFinish = fastest.finishTime;
    fastestPilot = fastest.track.compactName;
  }

  const startGate = getTaskStartGate(task);
  const taskStartIncludesSeconds = taskStartGateIncludesSeconds(startGate);

  return {
    trackStart,
    trackEnd,
    taskStart,
    taskStartIncludesSeconds,
    fastestFinish,
    fastestPilot,
  };
}

export function colorForIndex(index: number): string {
  return COMPETITOR_COLORS[index % COMPETITOR_COLORS.length];
}

function normalizeColorKey(color: string): string {
  return color.trim().toLowerCase();
}

function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const component = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = lightness - chroma * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${component(0)}${component(8)}${component(4)}`;
}

export function generateDistinctColor(index: number): string {
  if (index < COMPETITOR_COLORS.length) {
    return COMPETITOR_COLORS[index];
  }
  const extraIndex = index - COMPETITOR_COLORS.length;
  const hue = (extraIndex * 137.508) % 360;
  return hslToHex(hue, 72, 42);
}

export function getTrackColor(
  trackId: string,
  trackColors: Record<string, string>,
  fallbackIndex = 0,
): string {
  return trackColors[trackId] ?? colorForIndex(fallbackIndex);
}

export function assignUniqueTrackColors(
  tracks: Array<{ id: string }>,
  existing: Record<string, string> = {},
): Record<string, string> {
  const sortedTracks = [...tracks].sort((a, b) => a.id.localeCompare(b.id));
  const usedColors = new Set<string>();
  const result: Record<string, string> = {};

  for (const track of sortedTracks) {
    const color = existing[track.id]?.trim();
    if (!color) continue;
    const key = normalizeColorKey(color);
    if (usedColors.has(key)) continue;
    result[track.id] = color;
    usedColors.add(key);
  }

  let paletteIndex = 0;
  for (const track of sortedTracks) {
    if (result[track.id]) continue;

    while (paletteIndex < 1000) {
      const candidate = generateDistinctColor(paletteIndex);
      paletteIndex += 1;
      const key = normalizeColorKey(candidate);
      if (usedColors.has(key)) continue;
      result[track.id] = candidate;
      usedColors.add(key);
      break;
    }
  }

  return result;
}
