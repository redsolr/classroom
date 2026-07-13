import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="mb-3 text-fg-tertiary [&_svg]:size-6">{icon}</div>}
      <p className="text-[0.9375rem] font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[0.875rem] text-fg-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
