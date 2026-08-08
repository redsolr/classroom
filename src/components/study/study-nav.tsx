"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck,
  CircleUserRound,
  GraduationCap,
  Layers,
  LogOut,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/study", label: "Chat", icon: MessageCircle, exact: true },
  {
    href: "/study/vocab",
    label: "Vocabulary",
    icon: Layers,
    exact: true,
  },
  {
    href: "/study/vocab/review",
    label: "Review",
    icon: BookOpenCheck,
    exact: false,
  },
  {
    href: "/study/account",
    label: "Account",
    icon: CircleUserRound,
    exact: false,
  },
];

/**
 * The study shell's top bar — brand, section tabs, sign-out. One bar on
 * every viewport: the tab row scrolls horizontally when it doesn't fit,
 * so nothing is unreachable on a phone.
 */
export function StudyNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link
          href="/study"
          className="flex shrink-0 items-center gap-2 text-[0.9375rem] font-semibold tracking-tight"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-accent text-white">
            <GraduationCap className="size-4" />
          </span>
          <span className="hidden sm:inline">Class-room Study</span>
        </Link>

        <nav className="scrollbar-none -mb-px flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.875rem] font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-accent-text"
                    : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
                )}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <a
          href="/logout"
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.875rem] text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Sign out</span>
        </a>
      </div>
    </header>
  );
}
