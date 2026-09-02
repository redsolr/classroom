"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  GraduationCap,
  Menu,
  SquarePen,
  X,
  type LucideIcon,
} from "lucide-react";
import { NAVBAR_ACTIONS_SLOT_ID } from "@/components/shell/navbar-actions";
import { useMobileNav } from "@/lib/mobile-nav";
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
  /** Unread count, as a pill on the right of the row. Zero and undefined
   * both render nothing — a badge that can say "0" is a badge people
   * stop reading. */
  badge?: number;
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
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span
                className="min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[0.7rem] font-semibold text-white"
                aria-label={`${item.badge} unread`}
              >
                {item.badge}
              </span>
            )}
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
  const back = useMobileNav((s) => s.back);

  /**
   * LOCK THE PAGE WHILE THE DRAWER IS OPEN.
   *
   * The bug this fixes: open the drawer, scroll the content behind it,
   * and the drawer stops scrolling. Without a lock, a touch that starts
   * inside the drawer CHAINS into the page once the drawer's own list
   * hits either end (scroll chaining is the default), and the page —
   * which is what actually moved — keeps the gesture for the rest of the
   * interaction. The drawer is then a panel you cannot scroll, sitting
   * over a page you did not mean to move.
   *
   * Two halves, and both are needed. `overflow: hidden` on <body> stops
   * the page being the thing that scrolls; `overscroll-contain` on the
   * drawer's list (below) stops the chain reaching it in the first place,
   * which is what keeps the rubber-band at the ends of the list from
   * feeling like a dead panel on iOS.
   *
   * The scroll position is restored by hand: `overflow: hidden` on the
   * body discards it, so without this the page jumps to the top every
   * time the menu is opened and closed.
   */
  React.useEffect(() => {
    if (!open) return;
    const { body } = document;
    const scrollY = window.scrollY;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    // iOS Safari ignores `overflow: hidden` on the body, so the position
    // fix is the part that actually holds there; the overflow is what
    // holds everywhere else without the repaint the position swap costs.
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  return (
    <>
      {/* Mobile top bar — a quick new-chat and the page's own actions
          (portaled into the slot by NavbarActions) on the right, and on
          the left EITHER the hamburger or, on a detail page, the back
          arrow that replaces it (mobile-nav.ts). No brand — the drawer
          carries it.

          IT HAS NO BACKGROUND OF ITS OWN. A `bg-surface` band with a rule
          under it drew a hard line across the top of every phone screen
          and made the chrome read as a separate strip bolted above the
          app. The apps this product is shaped after let content run to
          the top edge and simply keep the controls legible over it. So:
          the page ground shows through, a scrim (below) fades whatever
          scrolls behind it, and each control carries its own small
          surface so it stays hittable and readable against artwork. */}
      <header className="mobile-navbar sticky top-0 z-30 flex h-12 items-center gap-1 px-3 lg:hidden">
        {/* Full-bleed wash of the page ground, strongest at the top edge
            and gone by the bar's bottom — the same two-layer trick the
            desktop topbar uses, and the reason a transparent bar stays
            readable over a scrolling shelf of covers instead of turning
            into a smear of half-cut artwork. */}
        <div
          aria-hidden
          className="mobile-navbar-scrim pointer-events-none absolute inset-x-0 top-0 h-[calc(100%+0.75rem)]"
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in srgb, var(--bg) 94%, transparent) 0%, color-mix(in srgb, var(--bg) 70%, transparent) 60%, transparent 100%)",
          }}
        />
        {back ? (
          <Link
            href={back.href}
            aria-label={`Back to ${back.label}`}
            className="mobile-navbar-back relative flex h-8 items-center gap-1 rounded-full bg-surface/70 pr-3 pl-2 text-[0.875rem] font-medium text-fg backdrop-blur-md transition-colors hover:bg-surface"
          >
            <ArrowLeft className="size-4" />
            <span className="max-w-40 truncate">{back.label}</span>
          </Link>
        ) : (
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="mobile-navbar-menu relative flex size-8 items-center justify-center rounded-full bg-surface/70 text-fg backdrop-blur-md transition-colors hover:bg-surface"
          >
            <Menu className="size-5" />
          </button>
        )}
        <div className="flex-1" />
        <Link
          href="/chat"
          aria-label="New chat"
          title="New chat"
          className="mobile-navbar-new-chat relative flex size-8 items-center justify-center rounded-full bg-surface/70 text-fg backdrop-blur-md transition-colors hover:bg-surface"
        >
          <SquarePen className="size-5" />
        </Link>
        <div
          id={NAVBAR_ACTIONS_SLOT_ID}
          className="mobile-navbar-actions relative flex items-center"
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
            {/* overscroll-contain: the other half of the scroll lock —
                it stops a swipe that runs past either end of this list
                from handing the gesture to the page underneath. */}
            <div className="nav-drawer-content flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-4">
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
