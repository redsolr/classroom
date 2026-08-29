"use client";

import * as React from "react";

/**
 * Is the on-screen keyboard currently covering the bottom of the screen?
 *
 * WHY THIS EXISTS — the "quick access doesn't stick to the bottom, it
 * jumps to the middle of the screen" bug. `position: fixed; bottom: 0`
 * is measured against the LAYOUT viewport, and opening a keyboard does
 * not shrink that; it shrinks the VISUAL viewport, the part you can
 * actually see. So the bar stays glued to the bottom of a page that is
 * now taller than the window, which puts it in the middle of the screen,
 * right above the keyboard — exactly the reported symptom, and exactly
 * why it looked intermittent: it only happens once something is focused.
 *
 * The fix has two halves, and the other one is in `app/layout.tsx`:
 * `interactiveWidget: "resizes-content"` makes Chrome on Android shrink
 * the layout viewport too, which is the real fix where it is supported.
 * Safari does not implement it, so this hook is what covers iOS — and it
 * is also the better PRODUCT behaviour on both: native apps hide bottom
 * navigation while you are typing, because the keyboard is the bottom
 * chrome for as long as it is up.
 *
 * The threshold is generous (120px). Browser chrome that slides away on
 * scroll also changes visual-viewport height, by ~50-60px; a keyboard is
 * never that small, so a gap this size cannot be confused with a URL bar.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const read = () => {
      // offsetTop matters when the page is scrolled INTO the keyboard's
      // space: the visual viewport is then both shorter and pushed down,
      // and only the sum describes how much is actually hidden.
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      setOpen(hidden > 120);
    };

    read();
    vv.addEventListener("resize", read);
    vv.addEventListener("scroll", read);
    return () => {
      vv.removeEventListener("resize", read);
      vv.removeEventListener("scroll", read);
    };
  }, []);

  return open;
}
