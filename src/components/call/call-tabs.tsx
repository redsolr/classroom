"use client";

import { MonitorUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallTab, CallTabKind } from "@/lib/call-tabs";

/**
 * The strip that says what else is open in this lesson.
 *
 * Rendered ONLY when there is more than one thing to look at. The common
 * case is two people talking, and a tab bar with a single tab in it is
 * chrome that never earns its place — it would sit at the top of every
 * lesson announcing that the lesson is the lesson.
 *
 * It floats over the video like the rest of the call's chrome rather than
 * pushing the frame down, because the frame is the point and a bar that
 * reflows it would resize the other person's face whenever a share
 * starts.
 */
export function CallTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: CallTab[];
  active: CallTabKind;
  onSelect: (id: CallTabKind) => void;
}) {
  if (tabs.length < 2) return null;

  return (
    // Bounded rather than centred on the whole width: the corner tiles
    // live at the top right and the recording indicator at the top left,
    // and a pill centred across all of it lands under one of them on a
    // phone. Centred inside what is left, truncating before it collides.
    <div className="absolute left-4 right-[9.5rem] top-4 z-10 flex justify-center sm:right-[12.5rem] lg:right-[15.5rem]">
      <div
        role="tablist"
        aria-label="What is open in this lesson"
        className="flex w-fit max-w-full items-center gap-1 rounded-full bg-black/60 p-1 backdrop-blur"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active === tab.id
                ? "bg-white text-black"
                : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            {tab.id === "lesson" ? (
              <Users size={13} className="shrink-0" />
            ) : (
              <MonitorUp size={13} className="shrink-0" />
            )}
            <span className="truncate">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
