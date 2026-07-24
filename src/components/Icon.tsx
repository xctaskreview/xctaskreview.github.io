import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type IconSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_PX: Record<IconSize, number> = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
};

interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ icon: IconComponent, size = 'sm', className, strokeWidth = 2 }: IconProps) {
  const px = SIZE_PX[size];
  const classes = ['ui-icon', className].filter(Boolean).join(' ');

  return (
    <IconComponent
      className={classes}
      size={px}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  );
}

interface IconLabelProps {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  iconSize?: IconSize;
  iconClassName?: string;
}

export function IconLabel({
  icon,
  children,
  className,
  iconSize = 'sm',
  iconClassName,
}: IconLabelProps) {
  return (
    <span className={['icon-label', className].filter(Boolean).join(' ')}>
      <Icon icon={icon} size={iconSize} className={iconClassName} />
      <span>{children}</span>
    </span>
  );
}

export function IconButtonContent({
  icon,
  children,
  iconSize = 'sm',
}: {
  icon: LucideIcon;
  children: ReactNode;
  iconSize?: IconSize;
}) {
  return (
    <IconLabel icon={icon} iconSize={iconSize} className="icon-button-content">
      {children}
    </IconLabel>
  );
}

export const XCDEMON_ICON_URL = '/xcdemon-icon.png';
export const CIVL_ICON_URL = '/civl-icon.png';

export function XcdemonIcon({ size = 'sm', className }: { size?: IconSize; className?: string }) {
  const px = SIZE_PX[size];
  const classes = ['ui-icon', 'xcdemon-icon', className].filter(Boolean).join(' ');

  return (
    <img
      src={XCDEMON_ICON_URL}
      alt=""
      aria-hidden="true"
      className={classes}
      width={px}
      height={px}
    />
  );
}

export function XcdemonButtonContent({
  children,
  iconSize = 'sm',
}: {
  children: ReactNode;
  iconSize?: IconSize;
}) {
  return (
    <span className="icon-label icon-button-content">
      <XcdemonIcon size={iconSize} />
      <span>{children}</span>
    </span>
  );
}

export function CivlIcon({ size = 'sm', className }: { size?: IconSize; className?: string }) {
  const px = SIZE_PX[size];
  const classes = ['ui-icon', 'civl-icon', className].filter(Boolean).join(' ');

  return (
    <img
      src={CIVL_ICON_URL}
      alt=""
      aria-hidden="true"
      className={classes}
      width={px}
      height={px}
    />
  );
}

export function CivlButtonContent({
  children,
  iconSize = 'sm',
}: {
  children: ReactNode;
  iconSize?: IconSize;
}) {
  return (
    <span className="icon-label icon-button-content">
      <CivlIcon size={iconSize} />
      <span>{children}</span>
    </span>
  );
}
