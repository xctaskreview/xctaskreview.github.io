import { Wind } from 'lucide-react';
import { Icon } from './Icon';

interface AppHomeLinkProps {
  className?: string;
  iconSize?: 'sm' | 'md';
  onOpenMenu?: () => void;
}

export function AppHomeLink({ className, iconSize = 'sm', onOpenMenu }: AppHomeLinkProps) {
  const classNames = ['app-home-link', className].filter(Boolean).join(' ');
  const content = (
    <>
      <Icon icon={Wind} size={iconSize} />
      <span>XC Task Review</span>
    </>
  );

  if (onOpenMenu) {
    return (
      <button type="button" className={classNames} aria-label="Open app menu" onClick={onOpenMenu}>
        {content}
      </button>
    );
  }

  return (
    <a href="/" className={classNames}>
      {content}
    </a>
  );
}
