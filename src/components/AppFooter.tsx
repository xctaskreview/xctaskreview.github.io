import { Bug, GitBranch, Smartphone } from 'lucide-react';
import { usePwaInstall } from '../lib/usePwaInstall';
import { IconLabel } from './Icon';

export const GITHUB_REPO_URL = 'https://github.com/xctaskreview/xctaskreview.github.io';
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues/new`;

interface AppFooterLinksProps {
  className?: string;
}

export function AppFooterLinks({ className = '' }: AppFooterLinksProps) {
  const { installed, hint, handleInstallClick } = usePwaInstall();

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
