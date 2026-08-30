"use client";

import * as React from "react";

/**
 * A PAN/ZOOM CAMERA over a fixed-size canvas.
 *
 * Drag, pinch, ctrl+wheel to zoom, wheel to pan, plus "fit it all" and
 * "put this point in the middle". It knows nothing about learning paths
 * — only about a rectangle of content inside a smaller viewport — which
 * is exactly why it is here and not in `path-tree.tsx`: that component
 * was two things at once, a camera and a tree, and the camera is the
 * half with all the event plumbing.
 *
 * ── The rule that must not break ───────────────────────────────────
 *
 * Wheel panning does NOT trap the page. When the canvas is already at
 * its edge the event goes through untouched, so the surrounding page
 * keeps scrolling — the same scroll-chaining lesson the mobile drawer
 * learned the hard way. And when the content fits, it is locked centred:
 * there is nothing to pan to, so panning does nothing.
 */

export type View = { scale: number; x: number; y: number };

export type PanZoomOptions = {
  /** Canvas size in its own coordinate space. */
  content: { width: number; height: number };
  /** Zoom limits. */
  min?: number;
  max?: number;
  /**
   * Below this fitted scale the content is too small to be worth
   * showing whole, so `autoFrame` centres on `focus` instead.
   */
  fitFloor?: number;
  /** The scale used when framing `focus` rather than fitting. */
  focusScale?: number;
  /** Where to look when the whole thing will not fit legibly. */
  focus?: { x: number; y: number };
};

/** Where an axis may sit: locked centred when the content fits, and
 * otherwise never dragged past its own edge. */
export function clampAxis(
  value: number,
  viewport: number,
  content: number,
): number {
  if (content <= viewport) return (viewport - content) / 2;
  return Math.min(0, Math.max(viewport - content, value));
}

export function usePanZoom({
  content,
  min = 0.3,
  max = 1.6,
  fitFloor = 0.45,
  focusScale = 0.66,
  focus,
}: PanZoomOptions) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<View>({ scale: 1, x: 0, y: 0 });

  /** Once the user has moved the camera, resizes stop re-framing it. */
  const touched = React.useRef(false);
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = React.useRef<number | null>(null);

  const clampTo = React.useCallback(
    (next: View, rect: DOMRect): View => ({
      scale: next.scale,
      x: clampAxis(next.x, rect.width, content.width * next.scale),
      y: clampAxis(next.y, rect.height, content.height * next.scale),
    }),
    [content.width, content.height],
  );

  const frame = React.useCallback(
    (mode: "fit" | "auto") => {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const fit = Math.min(
        rect.width / content.width,
        rect.height / content.height,
      );

      const target = mode === "auto" && fit < fitFloor ? focus : undefined;
      const scale = target
        ? focusScale
        : Math.min(max, Math.max(min, fit));
      const centred = target
        ? { x: rect.width / 2 - target.x * scale, y: rect.height / 2 - target.y * scale }
        : {
            x: (rect.width - content.width * scale) / 2,
            y: (rect.height - content.height * scale) / 2,
          };
      setView(clampTo({ scale, ...centred }, rect));
    },
    [clampTo, content.height, content.width, fitFloor, focus, focusScale, max, min],
  );

  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    frame("auto");
    const observer = new ResizeObserver(() => {
      if (!touched.current) frame("auto");
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame]);

  const zoomAt = React.useCallback(
    (factor: number, client?: { x: number; y: number }) => {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = client ? client.x - rect.left : rect.width / 2;
      const py = client ? client.y - rect.top : rect.height / 2;
      setView((current) => {
        const scale = Math.min(max, Math.max(min, current.scale * factor));
        const k = scale / current.scale;
        return clampTo(
          { scale, x: px - (px - current.x) * k, y: py - (py - current.y) * k },
          rect,
        );
      });
    },
    [clampTo, max, min],
  );

  // Wheel is a native non-passive listener because it has to decide, per
  // event, whether to preventDefault — React's synthetic handler cannot.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        touched.current = true;
        zoomAt(Math.exp(-event.deltaY * 0.0022), {
          x: event.clientX,
          y: event.clientY,
        });
        return;
      }
      const rect = el.getBoundingClientRect();
      setView((current) => {
        const next = clampTo(
          {
            scale: current.scale,
            x: current.x - event.deltaX,
            y: current.y - event.deltaY,
          },
          rect,
        );
        // Only claim the gesture if it actually moved something. At the
        // edge of the canvas the page keeps its scroll.
        if (next.x !== current.x || next.y !== current.y) {
          event.preventDefault();
          touched.current = true;
          return next;
        }
        return current;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clampTo, zoomAt]);

  const handlers = {
    onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
      // Anything clickable on the canvas is a press, never a drag.
      if ((event.target as HTMLElement).closest("button, a")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      touched.current = true;
    },
    onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
      const previous = pointers.current.get(event.pointerId);
      if (!previous) return;
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      const el = viewportRef.current;
      if (!el) return;

      if (pointers.current.size === 1) {
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        const rect = el.getBoundingClientRect();
        setView((current) =>
          clampTo({ ...current, x: current.x + dx, y: current.y + dy }, rect),
        );
        return;
      }

      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current !== null && pinchDist.current > 0) {
        zoomAt(distance / pinchDist.current, {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        });
      }
      pinchDist.current = distance;
    },
    onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
      endPointer(event);
    },
    onPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
      endPointer(event);
    },
  };

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  /**
   * Bring a point into view if it is not already — what keyboard focus
   * needs, because tabbing to something off-screen makes the whole
   * canvas look broken. Pointer clicks deliberately do NOT call this:
   * nothing is more disorienting than the view jumping under the thing
   * you just aimed at.
   */
  const revealPoint = React.useCallback(
    (point: { x: number; y: number }, margin = 90) => {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setView((current) => {
        const sx = point.x * current.scale + current.x;
        const sy = point.y * current.scale + current.y;
        const inside =
          sx > margin &&
          sx < rect.width - margin &&
          sy > margin &&
          sy < rect.height - margin;
        if (inside) return current;
        touched.current = true;
        return clampTo(
          {
            scale: current.scale,
            x: rect.width / 2 - point.x * current.scale,
            y: rect.height / 2 - point.y * current.scale,
          },
          rect,
        );
      });
    },
    [clampTo],
  );

  return {
    viewportRef,
    view,
    handlers,
    zoomAt,
    /** Fit everything, and let resizes re-frame again from here. */
    fit: React.useCallback(() => {
      touched.current = false;
      frame("fit");
    }, [frame]),
    /** Zoom by a step from a button, which counts as touching it. */
    zoomBy: React.useCallback(
      (factor: number) => {
        touched.current = true;
        zoomAt(factor);
      },
      [zoomAt],
    ),
    revealPoint,
    /** `translate3d(...) scale(...)` for the canvas element. */
    transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
  };
}
