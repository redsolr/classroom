"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

/**
 * ChatGPT's selection affordance: select any text inside the transcript
 * and a floating "Ask tutor" pill appears above the selection; tapping
 * it hands the selected text to the composer as a quote. Fixed-
 * positioned off the live selection rect — recomputed (rAF-debounced)
 * on every selectionchange, scroll (capture — the region scrolls, not
 * the window), and resize, so it tracks the selection instead of
 * drifting.
 */
export function SelectionAskPill({
  containerRef,
  onAsk,
}: {
  /** Only selections inside this element grow a pill. */
  containerRef: React.RefObject<HTMLElement | null>;
  onAsk: (text: string) => void;
}) {
  const [pill, setPill] = React.useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      const container = containerRef.current;
      const selection = document.getSelection();
      if (
        !container ||
        !selection ||
        selection.isCollapsed ||
        selection.rangeCount === 0
      ) {
        setPill(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = node instanceof Element ? node : node.parentElement;
      if (!element || !container.contains(element)) {
        setPill(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        setPill(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPill({ text, x: rect.left + rect.width / 2, y: rect.top });
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [containerRef]);

  if (!pill) return null;

  // Clamp inside the viewport — a selection hugging an edge must not
  // push the pill (or its tap target) off screen.
  const x = Math.min(Math.max(pill.x, 72), window.innerWidth - 72);
  const y = Math.max(pill.y, 48);

  return (
    <button
      type="button"
      // pointerdown, not click: pressing a button collapses the text
      // selection on pointer-down, which unmounts this pill before a
      // click could ever land. preventDefault also keeps the selection
      // (and the composer's focus) intact through the tap.
      onPointerDown={(e) => {
        e.preventDefault();
        const text = pill.text;
        setPill(null);
        document.getSelection()?.removeAllRanges();
        onAsk(text);
      }}
      className="selection-ask-pill animate-panel-in fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-1.5 text-[0.875rem] font-medium text-fg shadow-overlay"
      style={{ left: x, top: y - 8 }}
    >
      <Sparkles className="size-3.5 text-accent" />
      Ask tutor
    </button>
  );
}
