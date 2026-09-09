import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({ children, className = '', style }: CardProps) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function CardHeader({ title, action, children, style }: CardHeaderProps) {
  return (
    <div className="card-header" style={style}>
      <h3 className="card-title">{title}</h3>
      {action && <div>{action}</div>}
      {children}
    </div>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function CardContent({ children, style }: CardContentProps) {
  return <div className="card-content" style={style}>{children}</div>;
}

interface CardFooterProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function CardFooter({ children, style }: CardFooterProps) {
  return <div className="card-footer" style={style}>{children}</div>;
}