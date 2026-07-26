import type { ReactNode } from 'react';
import {
  LEADERBOARD_METRIC_ICONS,
  LEADERBOARD_METRIC_LABELS,
  type LeaderboardMetricKey,
} from '../lib/leaderboardMetrics';
import { Icon } from './Icon';

interface LeaderboardMetricLabelProps {
  metric: LeaderboardMetricKey;
  label?: string;
  className?: string;
  children?: ReactNode;
}

export function LeaderboardMetricLabel({
  metric,
  label,
  className,
  children,
}: LeaderboardMetricLabelProps) {
  const text = children ?? label ?? LEADERBOARD_METRIC_LABELS[metric];
  return (
    <span className={['metric-label', className].filter(Boolean).join(' ')}>
      <Icon icon={LEADERBOARD_METRIC_ICONS[metric]} size="xs" />
      <span>{text}</span>
    </span>
  );
}
