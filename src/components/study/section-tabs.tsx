import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The Mine / Official switch that sits under a section's title.
 *
 * Official content used to be a separate sidebar destination ("Curated
 * lists"), which buried the thing we most want people to find. It's a
 * TAB now: one tap from your own books, and from the drill surface. Both
 * sections point at the SAME catalog — one source, two doors — so a
 * curated set never has to exist twice.
 *
 * Server component: the active tab is passed in by the page that renders
 * it, so no client-side pathname matching is needed.
 */
export function SectionTabs({
  tabs,
}: {
  tabs: { href: string; label: string; active: boolean }[];
}) {
  return (
    <div
      className="section-tabs mb-5 flex items-center gap-1 border-b border-border"
      role="tablist"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          role="tab"
          aria-selected={tab.active}
          className={cn(
            "section-tab -mb-px border-b-2 px-3 py-2 text-[0.9375rem] font-medium transition-colors",
            tab.active
              ? "border-accent text-fg"
              : "border-transparent text-fg-tertiary hover:text-fg",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
