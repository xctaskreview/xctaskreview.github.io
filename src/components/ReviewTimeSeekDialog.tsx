import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Timer } from 'lucide-react';
import { formatTime } from '../lib/geo';
import {
  parseReviewClockSeekTime,
  parseReviewTimerSeekTime,
  type ReviewSeekTimeBounds,
} from '../lib/reviewSeekTime';
import { Icon } from './Icon';

export type ReviewTimeSeekMode = 'clock' | 'timer';

interface ReviewTimeSeekDialogProps extends ReviewSeekTimeBounds {
  mode: ReviewTimeSeekMode;
  open: boolean;
  onClose: () => void;
  onSeek: (time: Date) => void;
}

export function ReviewTimeSeekDialog({
  mode,
  open,
  onClose,
  onSeek,
  taskTimeZone,
  referenceDate,
  taskStart,
  trackStart,
  trackEnd,
}: ReviewTimeSeekDialogProps) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setError(null);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  const bounds = {
    taskTimeZone,
    referenceDate,
    taskStart,
    trackStart,
    trackEnd,
  };

  const submit = () => {
    const result =
      mode === 'clock'
        ? parseReviewClockSeekTime(query, bounds)
        : parseReviewTimerSeekTime(query, bounds);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSeek(result.time);
    onClose();
  };

  if (!open) return null;

  const exampleClock = formatTime(referenceDate, taskTimeZone, { includeSeconds: false });
  const isClock = mode === 'clock';

  return createPortal(
    <div className="pilot-quick-search-root" role="presentation">
      <div className="pilot-quick-search-backdrop" aria-hidden="true" onMouseDown={onClose} />
      <div
        className="pilot-quick-search-panel review-time-seek-panel"
        role="dialog"
        aria-modal="true"
        aria-label={isClock ? 'Set clock time' : 'Set task elapsed time'}
      >
        <div className="pilot-quick-search-input-row">
          <Icon icon={isClock ? Clock : Timer} size="sm" />
          <input
            ref={inputRef}
            type="text"
            className="pilot-quick-search-input"
            placeholder={isClock ? '13:45 or 13:45:30' : '1:23:45 or 45:30'}
            aria-label={isClock ? 'Clock time' : 'Elapsed task time'}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="review-time-seek-help">
          {isClock ? (
            <p>
              <strong>Clock</strong> ({taskTimeZone}): e.g. <code>{exampleClock}</code> or{' '}
              <code>13:45:30</code>
            </p>
          ) : taskStart ? (
            <p>
              <strong>Elapsed</strong> from task start: e.g. <code>1:23:45</code> or{' '}
              <code>45:30</code>
            </p>
          ) : (
            <p>This task has no start time, so elapsed seek is unavailable.</p>
          )}
          {error && <p className="review-time-seek-error">{error}</p>}
        </div>
        <p className="pilot-quick-search-hint">Enter to jump · Esc to close</p>
      </div>
    </div>,
    document.body,
  );
}
