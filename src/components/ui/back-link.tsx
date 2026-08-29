"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useMobileNav } from "@/lib/mobile-nav";

/**
 * THE "← back to the parent surface" control. One declaration per detail
 * page, two renderings:
 *
 *   lg and up — the inline link above the page header it has always been
 *   phones    — the navbar's lead control (see mobile-nav.ts for why the
 *               top-left is the right home for it, and why this is a
 *               store rather than a portal)
 *
 * The inline copy is `max-lg:hidden` rather than removed, because on a
 * phone the same words now live in the navbar and two back links stacked
 * on one screen is noise, not redundancy.
 */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const setBack = useMobileNav((s) => s.setBack);
  const clearBack = useMobileNav((s) => s.clearBack);

  // The label is the link's own text — a back control that says
  // "Back to All decks" beats a generic "Back" for a screen reader, and
  // it costs nothing because the page already wrote the words.
  const label = typeof children === "string" ? children : "Back";

  React.useEffect(() => {
    setBack({ href, label });
    return () => clearBack(href);
  }, [href, label, setBack, clearBack]);

  return (
    <Link
      href={href}
      className="back-link mb-4 inline-flex items-center gap-1.5 text-[0.875rem] text-fg-secondary transition-colors max-lg:hidden hover:text-fg"
    >
      <ArrowLeft className="size-3.5" />
      {children}
    </Link>
  );
}
