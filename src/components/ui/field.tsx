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
      className={cn(controlBase, "h-8 text-[0.85rem]", className)}
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
      className={cn(controlBase, "py-2 text-[0.85rem] leading-relaxed", className)}
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
      className={cn(controlBase, "h-8 text-[0.85rem] pr-8", className)}
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
        "block text-[0.8rem] font-medium text-fg-secondary mb-1.5",
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
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[0.75rem] text-fg-tertiary">{hint}</p>}
    </div>
  );
}
