"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Menu, SquarePen, X, type LucideIcon } from "lucide-react";
import { NAVBAR_ACTIONS_SLOT_ID } from "@/components/shell/navbar-actions";
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

/** The one active-tab rule — shared by every nav list (NavSection here,
 * the self-study tabs) so highlight semantics can't drift. */
export function isNavEntryActive(
  pathname: string,
  entry: Pick<NavEntry, "href" | "exact">,
): boolean {
  return entry.exact
    ? pathname === entry.href
    : pathname === entry.href || pathname.startsWith(entry.href + "/");
}

/** The one nav-row look (white text; accent when active) — shared with
 * the self-study section so the sidebar can't drift stylistically. */
export function navRowClass(active: boolean): string {
  return cn(
    "nav-row flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.9375rem] font-medium transition-colors",
    // The active row was HARDER to read than the inactive ones, which is
    // the hierarchy upside down. In dark, `--accent-text` (#a5a3ff, a
    // muted lavender) sat on `--accent-soft` (#232345, barely off the
    // #17171b panel) while every unselected row used `--text` (#ededf0,
    // near-white). The selected item was the dimmest thing in the rail.
    //
    // So the tint carries "which one", and the TEXT carries "selected":
    // full-strength `--text` plus semibold, over a fill mixed live from
    // `--accent` instead of the muted token. Local to the sidebar on
    // purpose — `--accent-soft` also backs info callouts and chat
    // bubbles, where brighter would be wrong.
    active
      ? "bg-accent/25 font-semibold text-fg"
      : "text-fg hover:bg-surface-hover",
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="nav-section-label mb-1.5 px-2.5 text-[0.72rem] font-semibold tracking-wider text-fg-tertiary uppercase">
      {children}
    </p>
  );
}

export function NavSection({
  label,
  items,
}: {
  /** Omitted = a bare tab list (no uppercase section heading). */
  label?: string;
  items: NavEntry[];
}) {
  const pathname = usePathname();
  return (
    <div className="mb-5">
      {label && <SectionLabel>{label}</SectionLabel>}
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={navRowClass(isNavEntryActive(pathname, item))}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Brand({ homeHref }: { homeHref: string }) {
  return (
    <Link
      href={homeHref}
      className="sidebar-brand flex items-center gap-2 text-[1rem] font-semibold tracking-tight"
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
      {/* Mobile top bar — ChatGPT-clean: hamburger on the left, a quick
          new-chat and the page's own actions (portaled into the slot by
          NavbarActions) on the right. No brand — the drawer carries it. */}
      <header className="mobile-navbar sticky top-0 z-30 flex h-12 items-center gap-1 border-b border-border bg-surface px-3 lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="mobile-navbar-menu flex size-8 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-surface-hover"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex-1" />
        <Link
          href="/chat"
          aria-label="New chat"
          title="New chat"
          className="mobile-navbar-new-chat flex size-8 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-surface-hover"
        >
          <SquarePen className="size-5" />
        </Link>
        <div
          id={NAVBAR_ACTIONS_SLOT_ID}
          className="mobile-navbar-actions flex items-center"
        />
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="nav-drawer-layer fixed inset-0 z-40 lg:hidden">
          <div
            className={cn(
              "nav-drawer-backdrop absolute inset-0 bg-black/40",
              closing ? "animate-overlay-out" : "animate-overlay-in",
            )}
            onClick={close}
          />
          {/* Proportional width (~65% of the viewport, ChatGPT-style —
              never edge to edge), floored so narrow phones don't get a
              sliver. */}
          <aside
            className={cn(
              "nav-drawer absolute inset-y-0 left-0 flex w-[65vw] max-w-sm min-w-64 flex-col bg-surface shadow-xl",
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
            {/* Mirrors the top bar's height so the drawer aligns with the
                navbar; brand left, close on the RIGHT (ChatGPT layout). */}
            <div className="nav-drawer-header flex h-12 shrink-0 items-center border-b border-border px-3">
              <Brand homeHref={homeHref} />
              <div className="flex-1" />
              <button
                type="button"
                aria-label="Close menu"
                onClick={close}
                className="nav-drawer-close flex size-8 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-surface-hover"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="nav-drawer-content flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
              {children}
            </div>
          </aside>
        </div>
      )}

      {/* Desktop static column — the section list scrolls when it
          outgrows the viewport (the "Plan & usage cut off" bug).
       *
       * A floating PANEL, not a wall: inset on every side, rounded, and
       * separated from the content by the page ground showing through
       * rather than by a 1px rule. A full-bleed column divided by a
       * hairline is the dashboard convention; every media app this
       * product is shaped after (Spotify, and YouTube Music's library)
       * uses a panel with air around it, and the air is most of why
       * theirs reads as an app and ours read as a settings screen. The
       * tokens already supported it — `--surface` sits a step lighter
       * than `--bg`, so the seam appears with no new colour.
       *
       * 360px. The width does PROPORTIONAL work, not just name-fitting:
       * a 320px rail against an 1800px content column made everything on
       * the right read as over-stretched, and the first instinct — cap
       * the content — would have fought the shelves, which genuinely
       * want the page. Spotify's own panel measures 420px, but that is a
       * player with a 48px-artwork library in it; ours is a nav tree, and
       * at 420 the rail was mostly empty. 360 is the settled point, with
       * the type back at its original scale.
       */}
      <aside className="app-sidebar sticky top-2 m-2 hidden h-[calc(100dvh-1rem)] w-[360px] shrink-0 flex-col rounded-xl bg-surface px-3 py-5 shadow-card lg:flex">
        <div className="app-sidebar-brand mb-6 px-2">
          <Brand homeHref={homeHref} />
        </div>
        <div className="app-sidebar-content flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </div>
      </aside>
    </>
  );
}
