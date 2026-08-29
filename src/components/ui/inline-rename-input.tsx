"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The one inline-rename input (sidebar chats, vocabulary books, teacher
 * book chips): Enter commits, Escape cancels, blur commits, and the
 * isComposing guard keeps an IME's Enter from submitting mid-conversion.
 * Focus is stolen back after a tick — openers are usually dropdown menu
 * items, and Radix returns focus to the trigger on close.
 */
export function InlineRenameInput({
  initialValue,
  ariaLabel,
  maxLength = 80,
  className,
  onCommit,
  onClose,
}: {
  initialValue: string;
  ariaLabel: string;
  maxLength?: number;
  className?: string;
  /** Called with the trimmed value, only when it actually changed. */
  onCommit: (next: string) => void;
  /** Always called when editing ends (commit, cancel, or blur). */
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState(initialValue);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.select(), 0);
    return () => clearTimeout(timer);
  }, []);

  const commit = () => {
    const next = draft.trim();
    onClose();
    if (next && next !== initialValue) onCommit(next);
  };

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      maxLength={maxLength}
      aria-label={ariaLabel}
      className={cn(
        "rounded border border-accent bg-transparent px-1.5 py-0.5 focus:outline-none",
        className,
      )}
    />
  );
}
