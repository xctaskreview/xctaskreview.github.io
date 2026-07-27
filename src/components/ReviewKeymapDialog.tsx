import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Icon } from './Icon';
import { ModalDialogBackdrop } from './ModalDialogBackdrop';

const REVIEW_SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'Space', description: 'Play or pause replay' },
  { keys: '← / →', description: 'Step replay 30 seconds backward / forward' },
  { keys: 'Shift + ← / →', description: 'Jump to previous / next time (start, then turnpoints)' },
  { keys: 'Backspace', description: 'Jump to task start' },
  { keys: '+ / −', description: 'Increase or decrease playback speed' },
  { keys: 'L', description: 'Toggle leaderboard panel' },
  { keys: 'C', description: 'Set clock time (13:45); also click Time in the toolbar' },
  { keys: 'T', description: 'Set elapsed task time (1:23:45); also click Elapsed in the toolbar' },
  { keys: '/', description: 'Quick pilot search — type to filter, ↑↓ to move, Enter to focus' },
  { keys: 'Esc', description: 'Clear focused pilot (closes search or keymap first)' },
];

interface ReviewKeymapDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ReviewKeymapDialog({ open, onClose }: ReviewKeymapDialogProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <ModalDialogBackdrop open={open} onClose={onClose}>
      <div
        className="review-keymap-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-keymap-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="review-keymap-header">
          <h2 id="review-keymap-title" className="review-keymap-title">
            Keymap
          </h2>
          <button type="button" className="review-keymap-close" aria-label="Close keymap" onClick={onClose}>
            <Icon icon={X} size="sm" />
          </button>
        </div>
        <p className="review-keymap-intro">Shortcuts for the task review screen.</p>
        <dl className="review-keymap-list">
          {REVIEW_SHORTCUTS.map((row) => (
            <div key={row.keys} className="review-keymap-row">
              <dt>
                <kbd>{row.keys}</kbd>
              </dt>
              <dd>{row.description}</dd>
            </div>
          ))}
        </dl>
        <p className="review-keymap-footnote">
          During the UI walkthrough, ← → and Enter move between tour steps.
        </p>
      </div>
    </ModalDialogBackdrop>
  );
}
