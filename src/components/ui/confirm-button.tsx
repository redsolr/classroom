"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Two-step inline delete: first click arms ("Sure?"), second click within
 * 3s fires the action. Lightweight alternative to a confirm modal.
 */
export function ConfirmButton({
  action,
  className,
  title = "Delete",
}: {
  action: () => Promise<void>;
  className?: string;
  title?: string;
}) {
  const [armed, setArmed] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <button
      type="button"
      title={title}
      disabled={pending}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
          return;
        }
        if (timer.current) clearTimeout(timer.current);
        setArmed(false);
        startTransition(async () => {
          try {
            await action();
          } catch (err) {
            console.error("[confirm-button] action failed:", err);
          }
        });
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.78rem] font-medium transition-colors",
        armed
          ? "bg-danger-soft text-danger"
          : "text-fg-tertiary hover:bg-surface-hover hover:text-danger",
        pending && "opacity-50",
        className,
      )}
    >
      <Trash2 className="size-3.5" />
      {armed && "Sure?"}
    </button>
  );
}
