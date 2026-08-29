"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck,
  Layers,
  MessageCircle,
  MessageSquareQuote,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pathnames this tab owns (prefix match), beyond its own href. */
  owns?: string[];
};

/**
 * The four places a learner actually goes. Chat is first because it is
 * the app's home (the PWA opens on it); the other three are the study
 * loop: what you have, what's due, what you could take.
 *
 * Reading list, Notes and the account stay in the drawer. A tab bar that
 * holds everything holds nothing — five is the ceiling, and the fifth
 * slot is worth more as breathing room than as one more destination.
 */
const TABS: Tab[] = [
  { href: "/chat", label: "Chat", icon: MessageCircle, owns: ["/project"] },
  { href: "/vocab", label: "Books", icon: Layers },
  { href: "/vocab/review", label: "Decks", icon: BookOpenCheck },
  { href: "/sentences", label: "Sentences", icon: MessageSquareQuote },
  { href: "/packs", label: "Official", icon: Sparkles },
];

/**
 * MOBILE QUICK-ACCESS BAR — the phone's primary navigation, always
 * there, thumb-height.
 *
 * The drawer alone made every move a two-step (open the drawer, then
 * choose), which is exactly the tax a bottom bar exists to remove. The
 * drawer stays for the long tail — chats, projects, pinned books,
 * account — the way a music app keeps a library behind its own tab.
 *
 * Its height is published as `--study-tabbar-h` (see globals.css) so the
 * chat pane and the Ask button can size around it instead of guessing;
 * the var goes to 0 at `lg`, where this bar isn't rendered at all.
 */
export function MobileTabbar() {
  const pathname = usePathname();

  // Longest match wins, so /vocab/review doesn't also light up /vocab.
  const activeHref = TABS.map((tab) => tab.href)
    .concat(TABS.flatMap((tab) => tab.owns ?? []))
    .filter(
      (href) => pathname === href || pathname.startsWith(href + "/"),
    )
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav
      aria-label="Study sections"
      className="mobile-tabbar fixed inset-x-0 bottom-0 z-30 flex h-[var(--study-tabbar-h)] items-start border-t border-border bg-surface pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
    >
      {TABS.map((tab) => {
        const active =
          activeHref === tab.href || tab.owns?.includes(activeHref ?? "");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "mobile-tab flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.625rem] font-medium transition-colors",
              active ? "text-accent-text" : "text-fg-tertiary",
            )}
          >
            <tab.icon className={cn("size-5", active && "fill-accent-soft")} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
