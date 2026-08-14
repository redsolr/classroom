import * as React from "react";

/**
 * THE page header — every top-level page renders its title through this
 * so the type scale, subtitle treatment, and action placement stay one
 * convention instead of drifting per page.
 */
export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  children,
}: {
  /** Leading glyph, styled by the caller (convention: `size-6 shrink-0 text-accent`). */
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Extra header content below the subtitle (e.g. a longer description). */
  children?: React.ReactNode;
}) {
  return (
    <header className="page-header mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="page-header-titles min-w-0">
        <h1 className="flex min-w-0 items-center gap-2.5 text-[1.625rem] font-semibold tracking-tight">
          {icon}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {subtitle && (
          <p className="page-header-subtitle mt-1 text-[0.9375rem] text-fg-secondary">
            {subtitle}
          </p>
        )}
        {children}
      </div>
      {actions && (
        <div className="page-header-actions flex items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl bg-surface shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  actions,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
      {actions}
    </div>
  );
}
