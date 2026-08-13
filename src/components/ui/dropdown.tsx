"use client";

import * as React from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dropdown = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;
export const DropdownSub = DropdownPrimitive.Sub;

const contentClass =
  "animate-panel-in z-50 min-w-44 rounded-lg bg-surface-raised p-1 shadow-overlay";

const itemClass =
  "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-[0.875rem] text-fg outline-none data-[highlighted]:bg-surface-hover";

export function DropdownContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={6}
        align="end"
        // Menus keep a margin from the viewport edges (ChatGPT-style)
        // instead of Radix's default flush collision placement.
        collisionPadding={12}
        className={cn(contentClass, className)}
        {...props}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(itemClass, "data-[disabled]:opacity-50", className)}
      {...props}
    />
  );
}

export function DropdownSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.SubTrigger>) {
  return (
    <DropdownPrimitive.SubTrigger
      className={cn(itemClass, "data-[state=open]:bg-surface-hover", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-4 text-fg-tertiary" />
    </DropdownPrimitive.SubTrigger>
  );
}

export function DropdownSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.SubContent>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.SubContent
        sideOffset={4}
        collisionPadding={12}
        className={cn(contentClass, className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-border" />;
}
