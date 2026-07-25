import type { GlobalLegStatistics } from '../lib/legStatistics';
import { formatLegStatisticsPopupLines } from '../lib/legStatisticsDisplay';
import type { AppPreferences } from '../lib/preferences';

interface LegStatisticsPopupContentProps {
  leg: GlobalLegStatistics;
  preferences: AppPreferences;
  timeZone: string;
}

export function LegStatisticsPopupContent({ leg, preferences, timeZone }: LegStatisticsPopupContentProps) {
  const lines = formatLegStatisticsPopupLines(leg, preferences, timeZone);

  return (
    <div className="turnpoint-popup">
      {lines.map((line, index) => (
        <div key={`${index}-${line}`} className="turnpoint-popup-line">
          {line}
        </div>
      ))}
    </div>
  );
}
