"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Menu, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one sidebar chrome for every signed-in surface (teacher, student,
 * self-study — CRM-style sections, no per-area shells):
 *
 *   desktop  — static w-64 column, exactly the shape the app always had
 *   mobile   — slim top bar with a hamburger that opens a slide-over
 *              drawer (the ChatGPT pattern); drawer is conditionally
 *              rendered so closed state leaves no off-screen duplicates
 *
 * Section content is provided by the role-specific sidebars; this file
 * also owns the shared SELF-STUDY section so teacher and student
 * sidebars can never drift apart on it.
 */

export type NavEntry = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match only the exact pathname (for parents of nested routes). */
  exact?: boolean;
};

/** The one nav-row look (white text; accent when active) — shared with
 * the self-study section so the sidebar can't drift stylistically. */
export function navRowClass(active: boolean): string {
  return cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.9375rem] font-medium transition-colors",
    active
      ? "bg-accent-soft text-accent-text"
      : "text-fg hover:bg-surface-hover",
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 px-2.5 text-[0.72rem] font-semibold tracking-wider text-fg-tertiary uppercase">
      {children}
    </p>
  );
}

export function NavSection({
  label,
  items,
}: {
  label: string;
  items: NavEntry[];
}) {
  const pathname = usePathname();
  return (
    <div className="mb-5">
      <SectionLabel>{label}</SectionLabel>
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={navRowClass(active)}>
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Brand({ homeHref }: { homeHref: string }) {
  return (
    <Link
      href={homeHref}
      className="flex items-center gap-2 text-[1rem] font-semibold tracking-tight"
    >
      <span className="flex size-6 items-center justify-center rounded-md bg-accent text-white">
        <GraduationCap className="size-4" />
      </span>
      Classroom
    </Link>
  );
}

export function SidebarShell({
  homeHref,
  children,
}: {
  homeHref: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  // Close = play the slide-out first, unmount when it finishes — the drawer
  // stays conditionally rendered so closed state leaves no off-screen
  // duplicates for a11y/tests.
  const [closing, setClosing] = React.useState(false);
  const close = React.useCallback(() => setClosing(true), []);

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2.5 border-b border-border bg-surface px-3 lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="flex size-8 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-surface-hover"
        >
          <Menu className="size-5" />
        </button>
        <Brand homeHref={homeHref} />
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className={cn(
              "absolute inset-0 bg-black/40",
              closing ? "animate-overlay-out" : "animate-overlay-in",
            )}
            onClick={close}
          />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-xl",
              closing ? "animate-drawer-out" : "animate-drawer-in",
            )}
            onAnimationEnd={(e) => {
              if (closing && e.target === e.currentTarget) {
                setOpen(false);
                setClosing(false);
              }
            }}
            // Tapping any link in the drawer closes it — cheaper and more
            // reliable than syncing open-state with the route.
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest("a")) close();
            }}
          >
            {/* Mirrors the top bar's row exactly (h-12, px-3, gap-2.5,
                border-b) so the drawer reads as the navbar's own panel:
                the X lands where the hamburger was, the brand stays put. */}
            <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-3">
              <button
                type="button"
                aria-label="Close menu"
                onClick={close}
                className="flex size-8 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-surface-hover"
              >
                <X className="size-5" />
              </button>
              <Brand homeHref={homeHref} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
              {children}
            </div>
          </aside>
        </div>
      )}

      {/* Desktop static column — the section list scrolls when it
          outgrows the viewport (the "Plan & usage cut off" bug). */}
      {/* w-72: the chat tree (titles + hover actions) needs more room
          than the old w-64 nav-only column. */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
        <div className="mb-6 px-2">
          <Brand homeHref={homeHref} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </div>
      </aside>
    </>
  );
}
