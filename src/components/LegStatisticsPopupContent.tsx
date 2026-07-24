import type { GlobalLegStatistics } from '../lib/legStatistics';
import { formatLegStatisticsPopupLines } from '../lib/legStatisticsDisplay';
import type { AppPreferences } from '../lib/preferences';

interface LegStatisticsPopupContentProps {
  leg: GlobalLegStatistics;
  preferences: AppPreferences;
}

export function LegStatisticsPopupContent({ leg, preferences }: LegStatisticsPopupContentProps) {
  const lines = formatLegStatisticsPopupLines(leg, preferences);

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
