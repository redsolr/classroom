"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one search field. Submits to `/search?q=` — a real page, not a
 * dropdown: results here are things you want to READ (what does this
 * word mean again?) as often as things you want to navigate to, and a
 * popover that vanishes on blur is hostile to reading.
 *
 * Two shapes of the same field:
 *
 *   bar   — the persistent desktop top bar (`StudyTopbar`), sized to sit
 *           inside a 3.5rem strip.
 *   page  — in the body of a page, which is how phones get it.
 *
 * Uncontrolled on purpose. The value only matters at submit, and a
 * controlled input would re-render the shell on every keystroke for
 * nothing. The one thing it tracks is the URL: on `/search` the field
 * shows the query being displayed, so the pinned bar reflects the page
 * under it instead of sitting empty above your own results. `key` forces
 * the remount an uncontrolled input needs to pick up a new defaultValue
 * when you search again.
 */
export function SearchBar({
  defaultValue,
  autoFocus = false,
  variant = "page",
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  variant?: "page" | "bar";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = defaultValue ?? (pathname === "/search" ? (params.get("q") ?? "") : "");

  return (
    <form
      key={value}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const q = String(
          new FormData(event.currentTarget).get("q") ?? "",
        ).trim();
        if (!q) return;
        router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
      className={cn(
        "search-bar relative w-full",
        variant === "page" && "mb-6 max-w-xl",
      )}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-tertiary" />
      <input
        name="q"
        type="search"
        autoFocus={autoFocus}
        defaultValue={value}
        placeholder="Search words, books, sentences, chats…"
        aria-label="Search"
        className={cn(
          "w-full rounded-full pr-4 pl-10 text-[0.9375rem] transition-colors placeholder:text-fg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          variant === "bar"
            ? "h-9 bg-surface-hover"
            : "h-11 bg-surface shadow-card",
        )}
      />
    </form>
  );
}
