"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/**
 * The one search field. Submits to `/search?q=` — a real page, not a
 * dropdown: results here are things you want to READ (what does this
 * word mean again?) as often as things you want to navigate to, and a
 * popover that vanishes on blur is hostile to reading.
 *
 * Uncontrolled on purpose. The value only matters at submit, and a
 * controlled input would re-render the page shell on every keystroke for
 * nothing.
 */
export function SearchBar({
  defaultValue = "",
  autoFocus = false,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const q = String(
          new FormData(event.currentTarget).get("q") ?? "",
        ).trim();
        if (!q) return;
        router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
      className="search-bar relative mb-6 w-full max-w-xl"
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-tertiary" />
      <input
        name="q"
        type="search"
        autoFocus={autoFocus}
        defaultValue={defaultValue}
        placeholder="Search words, books, sentences, chats…"
        aria-label="Search"
        className="h-11 w-full rounded-full bg-surface pr-4 pl-10 text-[0.9375rem] shadow-card transition-colors placeholder:text-fg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    </form>
  );
}
