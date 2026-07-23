import type { FlightTrack, TrackPoint } from './types';
import { getTrackEndTime, sanitizeTrackPointAltitudes } from './geo';

function parseIgcDate(line: string): Date | undefined {
  const match = line.match(/^HFDTE(?:DATE)?:?(\d{6})/);
  if (!match) return undefined;
  const raw = match[1];
  const day = Number(raw.slice(0, 2));
  const month = Number(raw.slice(2, 4)) - 1;
  let year = Number(raw.slice(4, 6));
  year += year >= 70 ? 1900 : 2000;
  return new Date(Date.UTC(year, month, day));
}

function parseIgcPressureAltitude(raw: string): number {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return 0;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 0;
}

function parseBRecord(line: string, baseDate: Date): TrackPoint | null {
  if (!line.startsWith('B') || line.length < 30) return null;

  const timeStr = line.slice(1, 7);
  if (!/^\d{6}$/.test(timeStr)) return null;

  const latRaw = line.slice(7, 14);
  const latHem = line.slice(14, 15);
  const lonRaw = line.slice(15, 23);
  const lonHem = line.slice(23, 24);
  const validity = line[24];

  if (!/^\d{7}$/.test(latRaw) || !/^[NS]$/.test(latHem)) return null;
  if (!/^\d{8}$/.test(lonRaw) || !/^[EW]$/.test(lonHem)) return null;
  if (validity !== 'A' && validity !== 'V') return null;

  const latDeg = Number(latRaw.slice(0, 2));
  const latMin = Number(latRaw.slice(2, 4)) + Number(latRaw.slice(4, 7)) / 1000;
  let lat = latDeg + latMin / 60;
  if (latHem === 'S') lat = -lat;

  const lonDeg = Number(lonRaw.slice(0, 3));
  const lonMin = Number(lonRaw.slice(3, 5)) + Number(lonRaw.slice(5, 8)) / 1000;
  let lon = lonDeg + lonMin / 60;
  if (lonHem === 'W') lon = -lon;

  const alt = parseIgcPressureAltitude(line.slice(25, 30));

  const hours = Number(timeStr.slice(0, 2));
  const minutes = Number(timeStr.slice(2, 4));
  const seconds = Number(timeStr.slice(4, 6));
  const time = new Date(baseDate);
  time.setUTCHours(hours, minutes, seconds, 0);

  return { time, lat, lon, alt };
}

const PILOT_HEADER_PATTERNS = [
  /^HFPLTPILOTINCHARGE[:!]?\s*(.*)$/i,
  /^HFPLTPILOT(?!INCHARGE)[:!]?\s*(.*)$/i,
  /^HFPLTPILIN[:!]?\s*(.*)$/i,
];

const GLIDER_HEADER_PATTERNS = [
  /^HFGTY(?:GLIDERTYPE)?[:!]?\s*(.*)$/i,
  /^HFRPGTWINGTYPE[:!]?\s*(.*)$/i,
  /^HPGTY(?:PARAGLIDERTYPE)?[:!]?\s*(.*)$/i,
];

function cleanHeaderValue(raw: string): string {
  return raw.replace(/^[:!\s]+/, '').replace(/[:!\s]+$/, '').trim();
}

function pilotNameFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.igc$/i, '').replace(/^.*[/\\]/, '').trim();
  return stripCompetitionIdSuffix(stem);
}

function stripCompetitionIdSuffix(name: string): string {
  return name.replace(/\.\d+\.\d+$/, '').trim();
}

function capitalizeWord(word: string): string {
  if (!word || !/\p{L}/u.test(word)) return word;
  if (word !== word.toLowerCase() && word !== word.toUpperCase()) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function capitalizePilotName(name: string): string {
  return name.replace(/[\p{L}][\p{L}'’-]*/gu, capitalizeWord);
}

function isUsablePilotName(name: string): boolean {
  if (!name) return false;
  if (/^[:!\s.]+$/.test(name)) return false;
  if (/^INCHARGE$/i.test(name)) return false;
  return /[A-Za-z0-9]/.test(name);
}

function isUsableGliderType(value: string): boolean {
  if (!value) return false;
  if (/^[:!\s.]+$/.test(value)) return false;
  if (/^(unknown|n\/a|na|none|-)$/i.test(value)) return false;
  return /[A-Za-z0-9]/.test(value);
}

export function resolvePilotDisplayName(pilotName: string, fileName: string): string {
  const resolved = isUsablePilotName(pilotName)
    ? stripCompetitionIdSuffix(pilotName)
    : pilotNameFromFileName(fileName) || 'Unknown pilot';

  return capitalizePilotName(resolved);
}

function parsePilotName(lines: string[], fileName: string): string {
  for (const line of lines) {
    for (const pattern of PILOT_HEADER_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;
      const name = cleanHeaderValue(match[1]);
      if (isUsablePilotName(name)) return name;
    }
  }

  return pilotNameFromFileName(fileName) || 'Unknown pilot';
}

function parseGliderType(lines: string[]): string | undefined {
  for (const line of lines) {
    for (const pattern of GLIDER_HEADER_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;
      const gliderType = cleanHeaderValue(match[1]);
      if (isUsableGliderType(gliderType)) return gliderType;
    }
  }

  return undefined;
}

function isBRecordLine(line: string): boolean {
  if (!line.startsWith('B') || line.length < 30) return false;
  return /^\d{6}$/.test(line.slice(1, 7));
}

function extractIgcHeaderLines(lines: string[]): string[] {
  const header: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (isBRecordLine(trimmed)) break;
    header.push(line);
  }

  return header;
}

export function parseGliderTypeFromHeader(headerText: string): string | undefined {
  if (!headerText.trim()) return undefined;
  return parseGliderType(headerText.split(/\r?\n/));
}

function parseFinishTime(lines: string[], baseDate: Date): Date | undefined {
  for (const line of lines) {
    if (!line.startsWith('C')) continue;
    if (/FINISH/i.test(line)) {
      const timeMatch = line.match(/^C(\d{6})/);
      if (timeMatch) {
        const timeStr = timeMatch[1];
        const finish = new Date(baseDate);
        finish.setUTCHours(
          Number(timeStr.slice(0, 2)),
          Number(timeStr.slice(2, 4)),
          Number(timeStr.slice(4, 6)),
          0,
        );
        return finish;
      }
    }
  }
  return undefined;
}

export function parseIgc(text: string, fileName: string): FlightTrack {
  const lines = text.split(/\r?\n/);
  const baseDate =
    lines.map(parseIgcDate).find((d): d is Date => d !== undefined) ?? new Date();
  const pilotName = resolvePilotDisplayName(parsePilotName(lines, fileName), fileName);
  const headerLines = extractIgcHeaderLines(lines);
  const igcHeader = headerLines.join('\n');
  const gliderType = parseGliderType(headerLines);
  const points: TrackPoint[] = [];

  for (const line of lines) {
    const point = parseBRecord(line.trim(), baseDate);
    if (point) points.push(point);
  }

  if (points.length === 0) {
    throw new Error(`No track points found in ${fileName}`);
  }

  points.sort((a, b) => a.time.getTime() - b.time.getTime());
  const sanitizedPoints = sanitizeTrackPointAltitudes(points);
  const landingTime = getTrackEndTime(sanitizedPoints);

  return {
    id: `${fileName}-${pilotName}`,
    pilotName,
    fileName,
    points: sanitizedPoints,
    date: baseDate,
    finishTime: parseFinishTime(lines, baseDate),
    landingTime,
    gliderType,
    igcHeader,
  };
}

export function extractPilotDisplayName(track: FlightTrack): string {
  return resolvePilotDisplayName(track.pilotName, track.fileName);
}

export function extractGliderType(track: FlightTrack): string | undefined {
  return track.gliderType ?? parseGliderTypeFromHeader(track.igcHeader ?? '');
}

export function mergeTrackMetadata(existing: FlightTrack, fresh: FlightTrack): FlightTrack {
  const igcHeader = fresh.igcHeader ?? existing.igcHeader;
  const gliderType = fresh.gliderType ?? parseGliderTypeFromHeader(igcHeader ?? '') ?? existing.gliderType;

  return {
    ...existing,
    pilotName: fresh.pilotName,
    fileName: fresh.fileName,
    gliderType,
    igcHeader,
  };
}

export function extractPilotFileName(track: FlightTrack): string {
  return track.fileName.replace(/^.*[/\\]/, '');
}

export function formatPilotNameWithFileName(track: FlightTrack): string {
  return `${extractPilotDisplayName(track)} (${extractPilotFileName(track)})`;
}

export function pilotFirstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  return trimmed.split(/\s+/)[0];
}
