import { useEffect, useState } from 'react';
import { Bug, GitBranch, Smartphone } from 'lucide-react';
import { IconLabel } from './Icon';
import {
  IOS_INSTALL_HINT,
  canPromptNativeInstall,
  isIosDevice,
  isStandaloneApp,
  promptNativeInstall,
  subscribeToInstallPrompt,
} from '../lib/pwaInstall';

export const GITHUB_REPO_URL = 'https://github.com/xctaskreview/xctaskreview.github.io';
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues/new`;

interface AppFooterLinksProps {
  className?: string;
}

export function AppFooterLinks({ className = '' }: AppFooterLinksProps) {
  const [installed, setInstalled] = useState(isStandaloneApp);
  const [nativeInstallReady, setNativeInstallReady] = useState(canPromptNativeInstall);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (isStandaloneApp()) {
      setInstalled(true);
      return;
    }

    return subscribeToInstallPrompt(() => {
      setNativeInstallReady(true);
    });
  }, []);

  const handleInstallClick = async () => {
    setHint(null);

    if (nativeInstallReady && canPromptNativeInstall()) {
      const accepted = await promptNativeInstall();
      if (accepted) {
        setInstalled(true);
      }
      return;
    }

    if (isIosDevice()) {
      setHint(IOS_INSTALL_HINT);
      return;
    }

    setHint('Install is not available in this browser yet. Try Chrome or Edge on desktop or Android.');
  };

  return (
    <div className={`app-footer-content${className ? ` ${className}` : ''}`}>
      <nav className="app-footer-links" aria-label="Project links">
        {!installed && (
          <>
            <button type="button" className="app-footer-link-button" onClick={() => void handleInstallClick()}>
              <IconLabel icon={Smartphone} iconSize="xs">
                Install app
              </IconLabel>
            </button>
            <span className="app-footer-separator" aria-hidden="true">
              ·
            </span>
          </>
        )}
        <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
          <IconLabel icon={GitBranch} iconSize="xs">
            GitHub
          </IconLabel>
        </a>
        <span className="app-footer-separator" aria-hidden="true">
          ·
        </span>
        <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
          <IconLabel icon={Bug} iconSize="xs">
            Report an issue
          </IconLabel>
        </a>
      </nav>
      {hint && <p className="app-install-hint">{hint}</p>}
    </div>
  );
}

export function AppFooter() {
  return (
    <footer className="app-footer">
      <AppFooterLinks />
    </footer>
  );
}
