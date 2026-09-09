import React from 'react';

export interface TooltipProps {
  content: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  if (!React.isValidElement(children)) {
    return <>{children}</>;
  }

  return (
    <span 
      className="tooltip-wrapper" 
      data-tooltip={content}
      style={{ '--tooltip-position': position } as React.CSSProperties}
    >
      {React.cloneElement(children as React.ReactElement<any>, { 'aria-label': content })}
    </span>
  );
}