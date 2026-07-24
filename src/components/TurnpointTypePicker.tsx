import { useEffect, useRef, useState } from 'react';
import type { EditableTurnpointRow, TurnpointTypeOption } from '../lib/types';
import { canOfferGoalType, canOfferStartType } from '../lib/xctask';
import { TurnpointGoalIcon, TurnpointStartIcon } from './TurnpointTypeIcons';

interface TurnpointTypePickerProps {
  turnpointIndex: number;
  value: TurnpointTypeOption;
  turnpoints: EditableTurnpointRow[];
  onApplyType: (nextType: TurnpointTypeOption) => void;
}

export function TurnpointTypePicker({
  turnpointIndex,
  value,
  turnpoints,
  onApplyType,
}: TurnpointTypePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const showStart = canOfferStartType(turnpointIndex, turnpoints) || value === 'SSS';
  const showGoal = canOfferGoalType(turnpointIndex, turnpoints) || value === 'ESS';

  useEffect(() => {
    if (!open) return;

    const closeOnOutside = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  const apply = (type: TurnpointTypeOption) => {
    onApplyType(type === value ? '' : type);
    setOpen(false);
  };

  const applyClear = () => {
    onApplyType('');
    setOpen(false);
  };

  return (
    <div className="welcome-task-edit-type-picker-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`welcome-task-edit-type-trigger${value === 'SSS' ? ' start' : ''}${value === 'ESS' ? ' goal' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Turnpoint ${turnpointIndex + 1} type`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {value === 'SSS' ? (
          <TurnpointStartIcon className="start" />
        ) : value === 'ESS' ? (
          <TurnpointGoalIcon className="goal" />
        ) : (
          <span className="welcome-task-edit-type-none" aria-hidden="true">
            —
          </span>
        )}
      </button>

      {open && (
        <div
          className="welcome-task-edit-type-picker"
          role="group"
          aria-label={`Choose turnpoint ${turnpointIndex + 1} type`}
        >
          <button
            type="button"
            className={`welcome-task-edit-type-option${value === '' ? ' selected' : ''}`}
            aria-pressed={value === ''}
            aria-label="Standard turnpoint"
            onClick={applyClear}
          >
            <span className="welcome-task-edit-type-none" aria-hidden="true">
              —
            </span>
          </button>
          {showStart && (
            <button
              type="button"
              className={`welcome-task-edit-type-option start${value === 'SSS' ? ' selected' : ''}`}
              aria-pressed={value === 'SSS'}
              aria-label="Start turnpoint"
              onClick={() => apply('SSS')}
            >
              <TurnpointStartIcon className="start" />
            </button>
          )}
          {showGoal && (
            <button
              type="button"
              className={`welcome-task-edit-type-option goal${value === 'ESS' ? ' selected' : ''}`}
              aria-pressed={value === 'ESS'}
              aria-label="Goal turnpoint"
              onClick={() => apply('ESS')}
            >
              <TurnpointGoalIcon className="goal" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
