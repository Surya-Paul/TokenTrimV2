import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  className?: string;
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  const classNames = ['badge', `badge-${variant}`, className].filter(Boolean).join(' ');
  
  return <span className={classNames}>{children}</span>;
}