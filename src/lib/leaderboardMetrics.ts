import {
  Crown,
  Gauge,
  MapPin,
  Mountain,
  Route,
  Send,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export const LEADERBOARD_METRIC_ICONS = {
  task: Route,
  lead: Crown,
  alt: Mountain,
  speed: Gauge,
  vario: TrendingUp,
  glide: Send,
  nextTp: MapPin,
} as const satisfies Record<string, LucideIcon>;

export type LeaderboardMetricKey = keyof typeof LEADERBOARD_METRIC_ICONS;

export const LEADERBOARD_METRIC_LABELS: Record<LeaderboardMetricKey, string> = {
  task: 'Task',
  lead: 'Lead',
  alt: 'Alt',
  speed: 'Speed',
  vario: 'Vario',
  glide: 'Glide',
  nextTp: 'Next TP',
};
