import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`card ${className}`}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

export function CardHeader({ title, action, children }: CardHeaderProps) {
  return (
    <div className="card-header">
      <h3 className="card-title">{title}</h3>
      {action && <div>{action}</div>}
      {children}
    </div>
  );
}

interface CardContentProps {
  children: React.ReactNode;
}

export function CardContent({ children }: CardContentProps) {
  return <div className="card-content">{children}</div>;
}

interface CardFooterProps {
  children: React.ReactNode;
}

export function CardFooter({ children }: CardFooterProps) {
  return <div className="card-footer">{children}</div>;
}