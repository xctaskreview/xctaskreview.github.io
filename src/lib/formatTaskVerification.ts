import type { PilotTaskVerification } from './taskVerification';

export function formatVerificationTime(time: Date | null | undefined, timeZone: string): string {
  if (!time) return '—';
  return time.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  });
}

export function formatVerificationDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatCrossingSummary(verification: PilotTaskVerification): string {
  const tagged = verification.crossings.filter((crossing) => crossing.inSequence);
  if (tagged.length === 0) return 'No valid turnpoint crossings';
  return tagged.map((crossing) => crossing.name).join(' → ');
}
