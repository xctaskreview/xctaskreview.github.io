import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';

/** Ignore backdrop dismiss briefly after open so the opening tap/click cannot close the dialog. */
const BACKDROP_DISMISS_SUPPRESS_MS = 450;

interface ModalDialogBackdropProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function ModalDialogBackdrop({ open, onClose, children }: ModalDialogBackdropProps) {
  const suppressDismissUntilRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      suppressDismissUntilRef.current = performance.now() + BACKDROP_DISMISS_SUPPRESS_MS;
    }
  }, [open]);

  if (!open) return null;

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (performance.now() < suppressDismissUntilRef.current) return;
    onCloseRef.current();
  };

  return (
    <div
      className="xcdemon-dialog-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      {children}
    </div>
  );
}
