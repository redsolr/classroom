import * as React from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";

/**
 * THE page container — one geometry for every top-level page so the
 * title starts at the same x on every screen. The teacher and student
 * layouts wrap their children in this; study pages render it themselves
 * because their layout must stay bare for the full-bleed /chat pane.
 * Content that wants a narrower measure caps itself INSIDE the shell —
 * the shell (and the title with it) never moves.
 */
export function PageShell({
  children,
  className = "",
  width = "default",
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * `default` — the reading measure every page has always used.
   * `wide` — for SHELF pages. A wall of artwork wants the window the
   * way a streaming home page does; the prose measure left covers
   * clipped beside half an empty screen. The ceiling exists only to
   * stop a row sprawling on an ultrawide.
   */
  width?: "default" | "wide";
}) {
  return (
    <div
      // The lg gutter is deliberately large (64px, 88px from xl —
      // Spotify's content grid measures 88.5px of left padding). The
      // sidebar is a floating panel now, so the content needs real air
      // beside it rather than the 40px that read as "touching".
      className={`page-shell mx-auto w-full ${width === "wide" ? "max-w-[1800px]" : "max-w-6xl"} px-4 py-6 sm:px-6 lg:px-16 lg:py-10 xl:px-[5.5rem] ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * THE page header — every top-level page renders its title through this
 * so the type scale, subtitle treatment, and action placement stay one
 * convention instead of drifting per page.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  children,
}: {
  /** The page's sidebar icon — styled here so no page can drift. */
  icon?: LucideIcon;
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
          {Icon && (
            <Icon aria-hidden className="size-6 shrink-0 text-accent" />
          )}
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

/** The "← back to the parent surface" link above detail-page headers. */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="back-link mb-4 inline-flex items-center gap-1.5 text-[0.875rem] text-fg-secondary transition-colors hover:text-fg"
    >
      <ArrowLeft className="size-3.5" />
      {children}
    </Link>
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
