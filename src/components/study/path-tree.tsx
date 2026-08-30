"use client";

import * as React from "react";
import { Check, Maximize2, Minus, Plus, Route } from "lucide-react";
import {
  branchColor,
  buildPathTree,
  type TreeBranch,
  type TreeNode,
} from "@/lib/study-path-tree";
import { banked, stepKindLabel, stepUnit } from "@/lib/study-path-steps";
import { usePanZoom } from "@/lib/use-pan-zoom";
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
 * ── The camera is not this component's job ─────────────────────────
 *
 * Drag, pinch, wheel, fit and "bring that into view" live in
 * `lib/use-pan-zoom.ts`, which knows about a rectangle inside a smaller
 * rectangle and nothing else. This file is about the TREE. The one rule
 * worth repeating here because it is easy to break from the outside:
 * wheel panning does not trap the page — at the canvas edge the event
 * goes through and the page keeps scrolling.
 */

/**
 * Below this fitted scale a node stops being a target worth aiming at,
 * so the canvas frames the learner's NEXT node and pans instead of
 * shrinking the whole tree into illegibility. Measured: every desktop
 * and tablet width clears it; only a phone does not.
 */
const FIT_FLOOR = 0.45;
const FOCUS_SCALE = 0.66;

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
  const [selection, setSelection] = React.useState<TreeSelection | null>(null);
  /**
   * The node under the pointer (or under keyboard focus), named in the
   * card's corner rather than in a tooltip on the node itself. A
   * floating tip gets CLIPPED by the canvas: a node near the left edge
   * had half its title cut off by the panel border, and a tip that
   * escapes the clip needs a portal and screen-space maths for something
   * the reference solves by putting the readout in a fixed place. It
   * also gives the "nothing is locked" note somewhere to live between
   * hovers instead of a permanent corner of prose.
   */
  const [inspected, setInspected] = React.useState<TreeNode | null>(null);


  const nextNode = React.useMemo(
    () =>
      layout.branches
        .flatMap((branch) => branch.nodes)
        .find((node) => node.state === 'next'),
    [layout],
  );

  const { viewportRef, handlers, transform, zoomBy, fit, revealPoint } =
    usePanZoom({
      content: layout,
      fitFloor: FIT_FLOOR,
      focusScale: FOCUS_SCALE,
      focus: nextNode,
    });

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
        {...handlers}
      >
        <div
          className="path-tree-canvas absolute top-0 left-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform,
          }}
        >
          <TreeLinks layout={layout} />

          {/* The root: the path itself, and the only circle that is not
              a button. There is nothing behind it to open — you are
              standing on it. */}
          <div
            className="path-root absolute flex w-52 flex-col items-center"
            style={{
              left: layout.root.x,
              top: layout.root.y,
              transform: "translate(-50%, -42px)",
            }}
          >
            <span className="path-root-disc grid size-[84px] place-items-center rounded-full border-2 border-accent bg-surface text-accent">
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
                onFocusNode={revealPoint}
              />
              {branch.nodes.map((node) => (
                <NodeButton
                  key={node.step.id}
                  node={node}
                  color={branch.spec.color}
                  onOpen={() =>
                    setSelection({ kind: "node", node, spec: branch.spec })
                  }
                  onFocusNode={revealPoint}
                  onInspect={setInspected}
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

      {/* THE INSPECTOR — what the pointer is on, named in a fixed place.
          Between hovers it carries the one thing the tree has to say
          about itself. */}
      <div className="path-tree-inspector pointer-events-none absolute bottom-3 left-4 hidden max-w-[18rem] sm:block">
        {inspected ? (
          <>
            <p
              className="text-[0.7rem] font-semibold tracking-[0.14em] uppercase"
              style={{ color: branchColor(inspected.branch) }}
            >
              {stepKindLabel(inspected.step.kind)}
            </p>
            <p className="text-[0.95rem] leading-snug font-semibold">
              {inspected.step.title}
            </p>
            <p className="text-[0.78rem] text-fg-tertiary tabular-nums">
              {banked(inspected.step)} of{" "}
              {inspected.step.target} {stepUnit(inspected.step.kind)}
              {inspected.state === "complete" ? " · done" : ""}
            </p>
          </>
        ) : (
          <p className="text-[0.72rem] text-fg-tertiary">
            Nothing is locked — every node opens, whether it is next or three
            ahead. Hover to name one, click to open it, drag to look around.
          </p>
        )}
      </div>

      <div className="path-tree-controls absolute top-3 right-3 flex flex-col overflow-hidden rounded-xl bg-surface-raised shadow-card">
        <button
          type="button"
          className="grid size-9 place-items-center text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          onClick={() => {
            zoomBy(1.2);
          }}
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          onClick={() => {
            zoomBy(1 / 1.2);
          }}
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          onClick={() => {
            fit();
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
            stroke: `color-mix(in oklab, ${branchColor(link.branch)} 34%, var(--border-strong))`,
          }}
          // Heavy enough to read as a limb. At 3px against 90px discs
          // the tree looked like circles connected by hairlines.
          strokeWidth={4}
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
            stroke={branchColor(link.branch)}
            strokeWidth={8}
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
  // Outward, so the caption always falls away from the trunk: the left
  // limb reads right-to-left into its own hub, the other two the other
  // way. The centre limb has no outward side, so it takes the right.
  const side = branch.spec.lean === -1 ? "left" : "right";
  return (
    <button
      type="button"
      className="path-hub absolute size-[128px]"
      data-branch={branch.spec.key}
      data-state={branch.done > 0 ? "lit" : "dim"}
      style={
        {
          left: branch.hub.x,
          top: branch.hub.y,
          transform: "translate(-50%, -50%)",
          "--branch": branch.spec.color,
        } as React.CSSProperties
      }
      onClick={onOpen}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) onFocusNode(branch.hub);
      }}
      aria-label={`${branch.spec.label} branch — ${branch.done} of ${branch.target} ${branch.spec.unit}`}
    >
      <span className="path-hub-disc grid size-full place-items-center rounded-full">
        <Icon className="size-11" aria-hidden />
      </span>

      {/* The name and the headline number sit BESIDE the hub, on the
          outward side. Under it they were centred on the trunk, which
          runs vertically through that exact spot — the cable went
          straight through the type. Nothing that reads as a caption may
          share an axis with a cable. */}
      <span
        className={cn(
          "path-hub-caption absolute top-1/2 flex -translate-y-1/2 flex-col whitespace-nowrap",
          side === "left"
            ? "right-full mr-4 items-end text-right"
            : "left-full ml-4 items-start text-left",
        )}
      >
        <span
          className="text-[0.8rem] font-semibold tracking-[0.16em] uppercase"
          style={{ color: "var(--branch)" }}
        >
          {branch.spec.label}
        </span>
        <span className="text-[2.5rem] leading-none font-bold tabular-nums">
          {branch.done}
        </span>
        <span className="text-[0.74rem] text-fg-tertiary tabular-nums">
          of {branch.target} {branch.spec.unit}
        </span>
      </span>
    </button>
  );
}

function NodeButton({
  node,
  color,
  onOpen,
  onFocusNode,
  onInspect,
}: {
  node: TreeNode;
  color: string;
  onOpen: () => void;
  onFocusNode: (point: { x: number; y: number }) => void;
  onInspect: (node: TreeNode | null) => void;
}) {
  const Icon = STEP_ICON[node.step.kind];
  const done = banked(node.step);
  const size = node.radius * 2;
  return (
    <button
      type="button"
      // A NODE IS A DISC, not a captioned card. Eleven two-line captions
      // is what made the first cut read as a diagram someone had typed
      // over: the reference carries an icon and a rank pill and nothing
      // else, and the title arrives on hover or in the panel. That is
      // the whole difference between a skill tree and an org chart.
      className="path-node absolute"
      data-state={node.state}
      data-branch={node.branch}
      style={
        {
          left: node.x,
          top: node.y,
          width: size,
          height: size,
          transform: `translate(-50%, -50%)`,
          "--branch": color,
        } as React.CSSProperties
      }
      onClick={onOpen}
      onPointerEnter={() => onInspect(node)}
      onPointerLeave={() => onInspect(null)}
      onFocus={(event) => {
        onInspect(node);
        if (event.target.matches(":focus-visible")) onFocusNode(node);
      }}
      onBlur={() => onInspect(null)}
      aria-label={`${node.step.title} — ${done} of ${node.step.target} ${stepUnit(node.step.kind)}${node.state === "next" ? ", start here" : ""}`}
    >
      {node.state === "next" && (
        <span className="path-node-chip absolute -top-7 left-1/2 -translate-x-1/2 path-node-chip-fill rounded-full px-2 py-px text-[0.62rem] font-semibold tracking-wide whitespace-nowrap uppercase">
          Start here
        </span>
      )}

      <span className="path-node-disc size-full">
        {node.state === "complete" ? (
          <Check style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden />
        ) : (
          <Icon style={{ width: size * 0.44, height: size * 0.44 }} aria-hidden />
        )}
      </span>

      {/* The rank pill, straight off the reference: how far through this
          node you are, in its own unit, hanging off the bottom edge. It
          replaced a ring of arc segments that said the same thing less
          precisely and made every node look like a gauge. */}
      <span className="path-node-pill absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 text-[0.68rem] font-semibold tabular-nums">
        {done}/{node.step.target}
      </span>

    </button>
  );
}
