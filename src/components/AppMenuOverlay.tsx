import { useEffect, useRef, type MouseEvent } from 'react';
import { Bug, GitBranch, Smartphone, Wind, X } from 'lucide-react';
import type { AppPreferences } from '../lib/preferences';
import { usePwaInstall } from '../lib/usePwaInstall';
import { AppPreferencesForm } from './AppPreferencesForm';
import { GITHUB_ISSUES_URL, GITHUB_REPO_URL } from './AppFooter';
import { Icon, IconLabel } from './Icon';

const BACKDROP_DISMISS_SUPPRESS_MS = 450;

interface AppMenuOverlayProps {
  open: boolean;
  onClose: () => void;
  preferences: AppPreferences;
  onPreferencesChange: (preferences: AppPreferences) => void;
  circlingDetectionDirty?: boolean;
  onRecomputeCirclingDetection?: () => void;
  onRestoreCirclingDefaults?: () => void;
}

export function AppMenuOverlay({
  open,
  onClose,
  preferences,
  onPreferencesChange,
  circlingDetectionDirty = false,
  onRecomputeCirclingDetection,
  onRestoreCirclingDefaults,
}: AppMenuOverlayProps) {
  const suppressDismissUntilRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { installed, hint, handleInstallClick } = usePwaInstall();

  useEffect(() => {
    if (open) {
      suppressDismissUntilRef.current = performance.now() + BACKDROP_DISMISS_SUPPRESS_MS;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (performance.now() < suppressDismissUntilRef.current) return;
    onCloseRef.current();
  };

  return (
    <div
      className="app-menu-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="app-menu-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-menu-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="app-menu-header">
          <div className="app-menu-brand" id="app-menu-title">
            <Icon icon={Wind} size="md" />
            <span>XC Task Review</span>
          </div>
          <button type="button" className="app-menu-close" aria-label="Close menu" onClick={onClose}>
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="app-menu-body">
          {!installed && (
            <div className="app-menu-section">
              <button type="button" className="app-menu-link-button" onClick={() => void handleInstallClick()}>
                <IconLabel icon={Smartphone} iconSize="sm">
                  Install app
                </IconLabel>
              </button>
              {hint && <p className="app-install-hint app-menu-install-hint">{hint}</p>}
            </div>
          )}

          <hr className="app-menu-divider" />

          <AppPreferencesForm
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
            circlingDetectionDirty={circlingDetectionDirty}
            onRecomputeCirclingDetection={onRecomputeCirclingDetection}
            onRestoreCirclingDefaults={onRestoreCirclingDefaults}
          />

          <hr className="app-menu-divider" />

          <nav className="app-menu-section app-menu-links" aria-label="Project links">
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="app-menu-external-link">
              <IconLabel icon={GitBranch} iconSize="sm">
                GitHub
              </IconLabel>
            </a>
            <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer" className="app-menu-external-link">
              <IconLabel icon={Bug} iconSize="sm">
                Report an issue
              </IconLabel>
            </a>
          </nav>
        </div>
      </div>
    </div>
  );
}
