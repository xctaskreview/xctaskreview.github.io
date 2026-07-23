import JSZip from 'jszip';
import type { FlightTrack, TaskTiming, XcTask } from './types';
import { parseIgc, extractPilotDisplayName } from './igc';
import { getTaskStartTime } from './xctask';
import { COMPETITOR_COLORS } from './geo';
import {
  enrichTracksWithTaskProgress,
  getTrackSnapshotAtTime,
  type EnrichedFlightTrack,
} from './taskProgress';

export { enrichTracksWithTaskProgress, getTrackSnapshotAtTime, type EnrichedFlightTrack };

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

  const finished = tracks.filter((t) => t.finishTime);
  let fastestFinish: Date | undefined;
  let fastestPilot: string | undefined;

  if (finished.length > 0) {
    const fastest = finished.reduce((best, current) =>
      current.finishTime!.getTime() < best.finishTime!.getTime() ? current : best,
    );
    fastestFinish = fastest.finishTime;
    fastestPilot = extractPilotDisplayName(fastest);
  }

  return { trackStart, trackEnd, taskStart, fastestFinish, fastestPilot };
}

export function colorForIndex(index: number): string {
  return COMPETITOR_COLORS[index % COMPETITOR_COLORS.length];
}
