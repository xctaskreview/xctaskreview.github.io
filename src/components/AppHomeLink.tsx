import { Wind } from 'lucide-react';
import { Icon } from './Icon';

interface AppHomeLinkProps {
  className?: string;
  iconSize?: 'sm' | 'md';
}

export function AppHomeLink({ className, iconSize = 'sm' }: AppHomeLinkProps) {
  return (
    <a href="/" className={['app-home-link', className].filter(Boolean).join(' ')}>
      <Icon icon={Wind} size={iconSize} />
      <span>XC Task Review</span>
    </a>
  );
}
