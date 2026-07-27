import { useStableCallbackRef } from '../lib/useStableCallbackRef';

interface ErrorOverlayProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorOverlay({ message, onDismiss }: ErrorOverlayProps) {
  const onDismissRef = useStableCallbackRef(onDismiss);

  return (
    <div
      className="error-overlay-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="error-overlay-message"
      onMouseDown={() => onDismissRef.current()}
    >
      <p className="error-overlay-panel" id="error-overlay-message">
        {message}
      </p>
    </div>
  );
}
