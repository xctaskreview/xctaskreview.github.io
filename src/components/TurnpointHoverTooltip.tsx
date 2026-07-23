import {
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FocusEvent,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { turnpointTooltipLines } from '../lib/turnpointTooltip';

const TOOLTIP_OFFSET = 12;
const TOOLTIP_FLIP_THRESHOLD = 120;

function tooltipTransform(y: number): string {
  if (y < TOOLTIP_FLIP_THRESHOLD) {
    return `translate(-50%, ${TOOLTIP_OFFSET}px)`;
  }
  return `translate(-50%, calc(-100% - ${TOOLTIP_OFFSET}px))`;
}

function TurnpointTooltipContent({
  tooltip,
  x,
  y,
}: {
  tooltip: string;
  x: number;
  y: number;
}) {
  return (
    <div
      className="turnpoint-hover-tooltip turnpoint-hover-tooltip-portal"
      style={{ left: x, top: y, transform: tooltipTransform(y) }}
      role="tooltip"
    >
      {turnpointTooltipLines(tooltip).map((line, index) => (
        <span key={`${index}-${line}`} className="turnpoint-hover-tooltip-line">
          {line}
        </span>
      ))}
    </div>
  );
}

type TurnpointHoverTriggerProps = {
  tooltip: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  as?: 'button' | 'div';
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'> &
  Pick<HTMLAttributes<HTMLDivElement>, 'title'>;

export function TurnpointHoverTrigger({
  tooltip,
  className,
  style,
  children,
  onClick,
  type = 'button',
  as = 'button',
}: TurnpointHoverTriggerProps) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const classes = ['turnpoint-hover-target', className].filter(Boolean).join(' ');

  const showTooltipFromTarget = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setAnchor({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const showTooltip = (event: MouseEvent<HTMLElement>) => {
    showTooltipFromTarget(event.currentTarget);
  };

  const showTooltipFromFocus = (event: FocusEvent<HTMLElement>) => {
    showTooltipFromTarget(event.currentTarget);
  };

  const hideTooltip = () => setAnchor(null);

  const commonProps = {
    className: classes,
    style,
    'aria-label': tooltip.replace(/\n/g, ', '),
    onMouseEnter: showTooltip,
    onMouseLeave: hideTooltip,
    onFocus: showTooltipFromFocus,
    onBlur: hideTooltip,
  };

  return (
    <>
      {as === 'div' ? (
        <div {...commonProps}>{children}</div>
      ) : (
        <button type={type} {...commonProps} onClick={onClick}>
          {children}
        </button>
      )}
      {anchor &&
        createPortal(
          <TurnpointTooltipContent tooltip={tooltip} x={anchor.x} y={anchor.y} />,
          document.body,
        )}
    </>
  );
}

export const TurnpointHoverTooltip = TurnpointHoverTrigger;

interface TurnpointFloatingTooltipProps {
  tooltip: string;
  x: number;
  y: number;
}

export function TurnpointFloatingTooltip({ tooltip, x, y }: TurnpointFloatingTooltipProps) {
  return createPortal(<TurnpointTooltipContent tooltip={tooltip} x={x} y={y} />, document.body);
}

export function TurnpointPopupContent({ tooltip }: { tooltip: string }) {
  return (
    <div className="turnpoint-popup">
      {turnpointTooltipLines(tooltip).map((line, index) => (
        <div key={`${index}-${line}`} className="turnpoint-popup-line">
          {line}
        </div>
      ))}
    </div>
  );
}
