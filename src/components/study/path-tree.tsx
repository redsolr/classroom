"use client";

import * as React from "react";
import { Check, Maximize2, Minus, Plus, Route } from "lucide-react";
import {
  buildPathTree,
  type TreeBranch,
  type TreeNode,
} from "@/lib/study-path-tree";
import { stepUnit } from "@/lib/study-path-steps";
import type { PathStepProgress } from "@/lib/study-progress";
import { BRANCH_ICON, STEP_ICON } from "@/components/study/path-icons";
import {
  PathNodePanel,
  type TreeSelection,
} from "@/components/study/path-node-panel";
import { cn } from "@/lib/utils";

/**
 * THE LEARNING PATH AS A SKILL TREE.
 *
 * One trunk, three limbs — vocabulary, grammar, conversation — growing
 * up from a root that is the path itself. Complete nodes fill in and lit
 * limbs carry the colour down the branch, so what you can read from
 * across the room is exactly the thing the old numbered spine could not
 * say: which KIND of work you have been doing, and which one you have
 * been avoiding. (Everyone avoids the same one. It is on the right.)
 *
 * ── Nothing is locked ──────────────────────────────────────────────
 *
 * Skill trees are the visual language of gated progression, and this
 * product's standing rule is the opposite: the path guides, it does not
 * railroad. So every node here is a live button whatever its state, no
 * node is ever `disabled`, and there is not a padlock in the file. A dim
 * node means "you have not done this yet" — the same thing the dim row
 * meant. `e2e/path-progress.spec.ts` holds us to it by opening a node
 * from the far end of a limb.
 *
 * ── Pan, zoom, and the one thing that must not break ───────────────
 *
 * The canvas is bigger than a phone, so it pans and pinches. Wheel
 * panning deliberately DOES NOT trap the page: when the canvas is
 * already at its edge the event goes through, because a box that eats
 * your scroll is how a fun page becomes a hostile one (the same scroll-
 * chaining lesson the mobile drawer learned the hard way). When the tree
 * fits the viewport it is locked centred — there is nothing to pan to.
 */

const MIN_SCALE = 0.3;
const MAX_SCALE = 1.6;
/**
 * Below this, a fitted tree is too small to READ — the labels are the
 * point, and at half scale they are 6px — so instead of shrinking the
 * whole thing to fit a card, we frame the learner's next node at a
 * usable size and let them drag, which is what every game tree does.
 * The fit button is still there for the overview.
 */
const FIT_FLOOR = 0.62;
const FOCUS_SCALE = 0.66;

type View = { scale: number; x: number; y: number };

function clampAxis(value: number, viewport: number, content: number): number {
  if (content <= viewport) return (viewport - content) / 2;
  return Math.min(0, Math.max(viewport - content, value));
}

export function PathTree({
  pathSlug,
  pathName,
  steps,
  nextId,
  className,
}: {
  pathSlug: string;
  pathName: string;
  steps: PathStepProgress[];
  nextId?: string;
  className?: string;
}) {
  const layout = React.useMemo(
    () => buildPathTree(steps, nextId),
    [steps, nextId],
  );
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<View>({ scale: 1, x: 0, y: 0 });
  const [selection, setSelection] = React.useState<TreeSelection | null>(null);

  /** Once the learner has moved the view, resizes stop re-framing it. */
  const touched = React.useRef(false);
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = React.useRef<number | null>(null);

  const nextNode = React.useMemo(
    () =>
      layout.branches
        .flatMap((branch) => branch.nodes)
        .find((node) => node.state === "next"),
    [layout],
  );

  const commit = React.useCallback(
    (next: View) => {
      const el = viewportRef.current;
      if (!el) return next;
      const rect = el.getBoundingClientRect();
      const clamped = {
        scale: next.scale,
        x: clampAxis(next.x, rect.width, layout.width * next.scale),
        y: clampAxis(next.y, rect.height, layout.height * next.scale),
      };
      setView(clamped);
      return clamped;
    },
    [layout],
  );

  const frame = React.useCallback(
    (mode: "fit" | "auto") => {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const fit = Math.min(
        rect.width / layout.width,
        rect.height / layout.height,
      );

      // Fit the whole tree when the whole tree is worth looking at;
      // otherwise open on the node the path is pointing at, which is
      // the one question the learner came with.
      const target = mode === "auto" && fit < FIT_FLOOR ? nextNode : undefined;
      if (!target) {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
        commit({
          scale,
          x: (rect.width - layout.width * scale) / 2,
          y: (rect.height - layout.height * scale) / 2,
        });
        return;
      }
      const scale = FOCUS_SCALE;
      commit({
        scale,
        x: rect.width / 2 - target.x * scale,
        y: rect.height / 2 - target.y * scale,
      });
    },
    [commit, layout, nextNode],
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
        const scale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, current.scale * factor),
        );
        const k = scale / current.scale;
        const next = {
          scale,
          x: px - (px - current.x) * k,
          y: py - (py - current.y) * k,
        };
        return {
          scale,
          x: clampAxis(next.x, rect.width, layout.width * scale),
          y: clampAxis(next.y, rect.height, layout.height * scale),
        };
      });
    },
    [layout],
  );

  // Wheel is a native non-passive listener because it has to be able to
  // decide, per event, whether to preventDefault — React's synthetic
  // wheel handler cannot.
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
        const contentH = layout.height * current.scale;
        const contentW = layout.width * current.scale;
        const wanted = {
          scale: current.scale,
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        };
        const next = {
          scale: current.scale,
          x: clampAxis(wanted.x, rect.width, contentW),
          y: clampAxis(wanted.y, rect.height, contentH),
        };
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
  }, [layout, zoomAt]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Nodes are buttons and hubs are buttons; a press on one is a press,
    // never the start of a drag.
    if ((event.target as HTMLElement).closest("button, a")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    touched.current = true;
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointers.current.size === 1) {
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setView((current) => ({
        scale: current.scale,
        x: clampAxis(current.x + dx, rect.width, layout.width * current.scale),
        y: clampAxis(
          current.y + dy,
          rect.height,
          layout.height * current.scale,
        ),
      }));
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
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  /** Keyboard walking has to move the camera, or tabbing focuses nodes
   * that are off-screen and the tree looks broken. Pointer clicks do
   * not — nothing is more disorienting than the view jumping under the
   * thing you just aimed at. */
  function onNodeFocus(node: { x: number; y: number }) {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setView((current) => {
      const sx = node.x * current.scale + current.x;
      const sy = node.y * current.scale + current.y;
      const margin = 90;
      const inside =
        sx > margin &&
        sx < rect.width - margin &&
        sy > margin &&
        sy < rect.height - margin;
      if (inside) return current;
      touched.current = true;
      return {
        scale: current.scale,
        x: clampAxis(
          rect.width / 2 - node.x * current.scale,
          rect.width,
          layout.width * current.scale,
        ),
        y: clampAxis(
          rect.height / 2 - node.y * current.scale,
          rect.height,
          layout.height * current.scale,
        ),
      };
    });
  }

  const completeNodes = layout.branches.reduce(
    (sum, branch) => sum + branch.completeNodes,
    0,
  );

  return (
    <div
      className={cn(
        "path-tree relative overflow-hidden rounded-2xl bg-surface shadow-card",
        className,
      )}
    >
      <div className="path-tree-sky pointer-events-none absolute inset-0" />

      <div
        ref={viewportRef}
        // Sized to what is LEFT of the window under the page header
        // rather than to a fraction of it: at 74vh the card's own bottom
        // edge sat below the fold on a laptop, so the tree was complete
        // and the root was still off-screen. Clamped at both ends so a
        // short window keeps a usable canvas and a tall one does not
        // stretch the tree into a poster.
        className="path-tree-viewport relative h-[clamp(26rem,calc(100svh-22rem),46rem)] touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div
          className="path-tree-canvas absolute top-0 left-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
          }}
        >
          <TreeLinks layout={layout} />

          {/* The root: the path itself, and the only circle that is not
              a button. There is nothing behind it to open — you are
              standing on it. */}
          <div
            className="path-root absolute flex w-44 flex-col items-center"
            style={{
              left: layout.root.x,
              top: layout.root.y,
              transform: "translate(-50%, -34px)",
            }}
          >
            <span className="path-root-disc grid size-[68px] place-items-center rounded-full border-2 border-accent bg-surface text-accent">
              <Route className="size-6" aria-hidden />
            </span>
            <span className="mt-2 text-center text-[0.8125rem] font-semibold">
              {pathName}
            </span>
            <span className="text-center text-[0.72rem] text-fg-tertiary tabular-nums">
              {completeNodes} of {steps.length} nodes done
            </span>
          </div>

          {layout.branches.map((branch) => (
            <React.Fragment key={branch.spec.key}>
              <HubButton
                branch={branch}
                onOpen={() => setSelection({ kind: "branch", branch })}
                onFocusNode={onNodeFocus}
              />
              {branch.nodes.map((node) => (
                <NodeButton
                  key={node.step.id}
                  node={node}
                  color={branch.spec.color}
                  onOpen={() =>
                    setSelection({ kind: "node", node, spec: branch.spec })
                  }
                  onFocusNode={onNodeFocus}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* The tree grows UP, so whatever is out of frame is above — a
          soft edge says "there is more" without a scrollbar, which a
          transformed canvas cannot have. */}
      <div className="path-tree-fade pointer-events-none absolute inset-x-0 top-0 h-14" />

      <p className="path-tree-note pointer-events-none absolute bottom-3 left-3 max-w-[16rem] text-[0.72rem] text-fg-tertiary">
        Nothing is locked — every node opens, whether it is next or three
        ahead. Drag to look around.
      </p>

      <div className="path-tree-controls absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-xl bg-surface-raised shadow-card">
        <button
          type="button"
          className="grid size-9 place-items-center text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          onClick={() => {
            touched.current = true;
            zoomAt(1.2);
          }}
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          onClick={() => {
            touched.current = true;
            zoomAt(1 / 1.2);
          }}
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          onClick={() => {
            touched.current = false;
            frame("fit");
          }}
          aria-label="Fit the whole tree"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>

      <PathNodePanel
        pathSlug={pathSlug}
        selection={selection}
        onSelect={setSelection}
        onClose={() => setSelection(null)}
      />
    </div>
  );
}

/** The limbs. Two passes: every link drawn dim, then the lit ones over
 * the top in the branch's colour, so a half-done limb reads as a line
 * that has filled in this far rather than two different lines. */
function TreeLinks({
  layout,
}: {
  layout: ReturnType<typeof buildPathTree>;
}) {
  const colorOf = (key: string) =>
    layout.branches.find((branch) => branch.spec.key === key)?.spec.color ??
    "var(--border-strong)";

  return (
    <svg
      className="path-tree-links pointer-events-none absolute top-0 left-0"
      width={layout.width}
      height={layout.height}
      aria-hidden
    >
      {layout.links.map((link, index) => (
        <path
          key={`dim-${index}`}
          d={link.d}
          fill="none"
          // Tinted, not grey: an unlit limb should still read as ITS
          // limb. Three identical grey curves is a diagram of a tree
          // rather than a picture of one.
          style={{
            stroke: `color-mix(in oklab, ${colorOf(link.branch)} 26%, var(--border-strong))`,
          }}
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}
      {layout.links
        .filter((link) => link.lit)
        .map((link, index) => (
          <path
            key={`lit-${index}`}
            className="path-tree-link-lit"
            d={link.d}
            fill="none"
            stroke={colorOf(link.branch)}
            strokeWidth={4}
            strokeLinecap="round"
          />
        ))}
    </svg>
  );
}

function HubButton({
  branch,
  onOpen,
  onFocusNode,
}: {
  branch: TreeBranch;
  onOpen: () => void;
  onFocusNode: (point: { x: number; y: number }) => void;
}) {
  const Icon = BRANCH_ICON[branch.spec.key];
  return (
    <button
      type="button"
      className="path-hub absolute flex w-52 flex-col items-center"
      data-branch={branch.spec.key}
      data-state={branch.completeNodes > 0 ? "lit" : "dim"}
      style={
        {
          left: branch.hub.x,
          top: branch.hub.y,
          transform: "translate(-50%, -52px)",
          "--branch": branch.spec.color,
        } as React.CSSProperties
      }
      onClick={onOpen}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) onFocusNode(branch.hub);
      }}
      aria-label={`${branch.spec.label} branch — ${branch.done} of ${branch.target} ${branch.spec.unit}`}
    >
      <span className="path-hub-disc grid size-[104px] place-items-center rounded-full">
        <Icon className="size-8" aria-hidden />
      </span>
      <span
        className="mt-2 text-[0.72rem] font-semibold tracking-[0.14em] uppercase"
        style={{ color: "var(--branch)" }}
      >
        {branch.spec.label}
      </span>
      <span className="text-[1.75rem] leading-none font-bold tabular-nums">
        {branch.done}
      </span>
      <span className="text-[0.72rem] text-fg-tertiary tabular-nums">
        of {branch.target} {branch.spec.unit}
      </span>
    </button>
  );
}

function NodeButton({
  node,
  color,
  onOpen,
  onFocusNode,
}: {
  node: TreeNode;
  color: string;
  onOpen: () => void;
  onFocusNode: (point: { x: number; y: number }) => void;
}) {
  const Icon = STEP_ICON[node.step.kind];
  const done = Math.min(node.step.done, node.step.target);
  return (
    <button
      type="button"
      className="path-node absolute flex w-44 flex-col items-center"
      data-state={node.state}
      data-branch={node.branch}
      style={
        {
          left: node.x,
          top: node.y,
          transform: "translate(-50%, -38px)",
          "--branch": color,
        } as React.CSSProperties
      }
      onClick={onOpen}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) onFocusNode(node);
      }}
      aria-label={`${node.step.title} — ${done} of ${node.step.target} ${stepUnit(node.step.kind)}${node.state === "next" ? ", start here" : ""}`}
    >
      <span className="path-node-halo relative grid place-items-center">
        {node.state === "next" && (
          <span className="path-node-chip absolute -top-6 rounded-full bg-accent px-2 py-px text-[0.62rem] font-semibold tracking-wide text-white uppercase">
            Start here
          </span>
        )}
        <span className="path-node-disc">
          {node.state === "complete" ? (
            <Check className="size-7" aria-hidden />
          ) : (
            <Icon className="size-6" aria-hidden />
          )}
        </span>
        <Pips node={node} />
      </span>
      <span className="path-node-label mt-2 text-center text-[0.78rem] leading-tight font-semibold">
        {node.step.title}
      </span>
      <span className="path-node-meta text-center text-[0.7rem] text-fg-tertiary tabular-nums">
        {done} / {node.step.target} {stepUnit(node.step.kind)}
      </span>
    </button>
  );
}

/** The satellites: the step's target cut into equal chunks, arranged on
 * the outer side of the disc so they never sit on the limb coming in. */
function Pips({ node }: { node: TreeNode }) {
  const outward = node.branch === "vocabulary" ? -1 : 1;
  const radius = 50;
  const count = node.pips.length;
  return (
    <span className="path-node-pips pointer-events-none absolute inset-0">
      {node.pips.map((filled, index) => {
        const spread = count === 1 ? 0 : -55 + (110 * index) / (count - 1);
        const angle = (spread * Math.PI) / 180;
        // Whole pixels, and no `calc()`: the browser re-serialises a
        // style attribute when React diffs it at hydration, and a
        // fifteen-decimal offset inside calc() comes back rounded — a
        // mismatch warning on every pip on the page. The pip centres
        // itself with a negative margin instead (see globals.css).
        return (
          <span
            key={index}
            className="path-pip absolute top-1/2 left-1/2"
            data-filled={filled}
            title={`${node.pipWorth} ${stepUnit(node.step.kind)}`}
            style={{
              transform: `translate(${Math.round(outward * Math.cos(angle) * radius)}px, ${Math.round(Math.sin(angle) * radius)}px)`,
            }}
          />
        );
      })}
    </span>
  );
}
