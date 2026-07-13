"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover shadow-sm border border-transparent",
  secondary:
    "bg-surface text-fg border border-border-strong hover:bg-surface-hover shadow-sm",
  ghost: "text-fg-secondary hover:bg-surface-hover hover:text-fg",
  danger:
    "bg-surface text-danger border border-border-strong hover:bg-danger-soft shadow-sm",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[0.8rem] gap-1.5 rounded-md",
  md: "h-8 px-3 text-[0.85rem] gap-2 rounded-md",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:opacity-50 disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/** Submit button that shows a spinner while its parent form action runs. */
export function SubmitButton({
  children,
  ...props
}: Omit<ButtonProps, "type" | "loading">) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending} {...props}>
      {children}
    </Button>
  );
}
