import * as React from "react";
import { cn } from "@/lib/utils";

const controlBase =
  "w-full rounded-md border border-border-strong bg-surface px-2.5 text-fg " +
  "placeholder:text-fg-tertiary transition-colors " +
  "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 " +
  "disabled:opacity-50";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(controlBase, "h-9 text-[0.9375rem]", className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlBase, "py-2 text-[0.9375rem] leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(controlBase, "h-9 text-[0.9375rem] pr-8", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block text-[0.875rem] font-medium text-fg-secondary mb-1.5",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

export function Field({
  label,
  children,
  className,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  // Wrapping <label> gives the control an accessible name without id
  // plumbing — screen readers and getByLabel() both resolve it.
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[0.875rem] font-medium text-fg-secondary">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[0.8125rem] text-fg-tertiary">{hint}</span>}
    </label>
  );
}
