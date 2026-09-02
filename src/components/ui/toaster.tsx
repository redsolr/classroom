"use client";

import { usePathname } from "next/navigation";
import { Toaster as SonnerToaster, toast } from "sonner";
import { useThemeStore } from "@/stores/theme.store";

/**
 * ACTION FEEDBACK — the "did that work?" layer.
 *
 * Before this, saving a word, filing it into a book or importing a pack
 * changed a heart's fill and nothing else. That reads as feedback only
 * if you happened to be looking at the control you just pressed, which
 * on a phone is exactly where your thumb is. Every media app answers
 * this the same way: a small confirmation near the bottom edge that
 * names WHAT happened and gets out of the way.
 *
 * Placement is bottom-centre on phones and bottom-right on desktop —
 * where the thumb is, and where the eye isn't, respectively. The bottom
 * offset clears the phone tab bar using its PUBLISHED height rather than
 * a copy of the number, so a toast can never land under the bar (and
 * closes the gap on its own while the keyboard is up, since that var
 * goes to 0 — see globals.css).
 *
 * Errors are NOT routed here. A toast that disappears after four seconds
 * is the wrong home for something the learner has to act on, and the
 * surfaces that can fail already say so in place, next to the thing that
 * failed. Toasts confirm; they do not report.
 */
export function Toaster() {
  const resolved = useThemeStore((s) => s.resolved);
  // In a lesson call the bottom edge IS the controls — Record, Stop,
  // Leave. A confirmation landing there covers the button the person
  // just pressed, and a covered toast is HOVERED, which stops it
  // auto-dismissing: on CI (2026-09-02) "Recording — this lesson will
  // become study material" sat over Stop for four minutes intercepting
  // every click. Bottom is the thumb's edge everywhere else; in a call
  // it is the room's, so confirmations go to the top there.
  const inCall = usePathname()?.startsWith("/call/") ?? false;

  return (
    <SonnerToaster
      theme={resolved}
      position={inCall ? "top-center" : "bottom-center"}
      offset="calc(var(--study-tabbar-h) + 1rem)"
      mobileOffset="calc(var(--study-tabbar-h) + 1rem)"
      // The tokens, not sonner's own palette — a confirmation in a
      // different grey than the app's surfaces reads as a browser
      // notification rather than part of the product.
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border-0 !bg-surface !text-fg !shadow-card !font-sans",
          description: "!text-fg-secondary",
          actionButton: "!bg-accent !text-white !rounded-md",
        },
      }}
      className={inCall ? undefined : "lg:!right-6 lg:!left-auto"}
    />
  );
}

export { toast };
