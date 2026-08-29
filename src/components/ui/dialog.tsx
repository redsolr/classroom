"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay animate-overlay-in fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
      {/* ChatGPT-style card: vertically centered, side margins so it
          never touches the screen edges, generous rounding. */}
      <DialogPrimitive.Content
        className={cn(
          "dialog-panel animate-panel-in fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
          "rounded-2xl bg-surface-raised shadow-overlay focus:outline-none",
          className,
        )}
        {...props}
      >
        <div className="dialog-header flex items-start justify-between border-b border-border px-5 py-4">
          <div className="dialog-titles">
            <DialogPrimitive.Title className="dialog-title text-[1rem] font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="dialog-description mt-0.5 text-[0.875rem] text-fg-secondary">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">
                {title}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="dialog-close rounded-md p-1 text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="dialog-body px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
