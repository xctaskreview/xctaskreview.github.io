import { Bug, GitBranch } from 'lucide-react';
import { IconLabel } from './Icon';

export const GITHUB_REPO_URL = 'https://github.com/xctaskreview/xctaskreview.github.io';
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues/new`;

interface AppFooterLinksProps {
  className?: string;
}

export function AppFooterLinks({ className = '' }: AppFooterLinksProps) {
  return (
    <nav className={`app-footer-links${className ? ` ${className}` : ''}`} aria-label="Project links">
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
  );
}

export function AppFooter() {
  return (
    <footer className="app-footer">
      <AppFooterLinks />
    </footer>
  );
}
