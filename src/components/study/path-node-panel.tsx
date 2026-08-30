"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { loadPathStepDetail } from "@/lib/actions/paths";
import type {
  MicroNode,
  MicroNodeState,
  StepDetail,
} from "@/lib/study-path-micro";
import {
  banked,
  stepCta,
  stepHref,
  stepKindLabel,
  stepUnit,
} from "@/lib/study-path-steps";
import type { BranchSpec, TreeBranch, TreeNode } from "@/lib/study-path-tree";
import { BRANCH_ICON, STEP_ICON } from "@/components/study/path-icons";
import { cn } from "@/lib/utils";

/**
 * WHAT A NODE OPENS ONTO.
 *
 * A tree where the circles are only decoration is a picture of a
 * curriculum, not a way through one. So every node opens, and what it
 * opens onto has to be something the node itself could not show: why
 * this step is here, how it is measured, and — the part worth building —
 * the MICRO-NODES, one per real item behind it. Every word in the book
 * and whether you have it. Every word of yours still missing a sentence
 * card. Ten circles for ten messages, six of them lit.
 *
 * Hub circles open too, onto the limb's own claim and its nodes. A limb
 * carries a big number, and a big number nobody can drill into is the
 * kind of statistic this app refuses to print.
 *
 * A sheet rather than a centred dialog, and that is a real choice: the
 * TREE has to stay visible behind it. Half the value of opening a node
 * is seeing where it sits in the thing you are looking at, and a card in
 * the middle of the screen covers exactly that.
 */

export type TreeSelection =
  | { kind: "node"; node: TreeNode; spec: BranchSpec }
  | { kind: "branch"; branch: TreeBranch };

export function PathNodePanel({
  pathSlug,
  selection,
  onSelect,
  onClose,
}: {
  pathSlug: string;
  selection: TreeSelection | null;
  /** Branch mode lists its nodes; picking one swaps the panel over
   * rather than closing and making the learner aim at a circle again. */
  onSelect: (selection: TreeSelection) => void;
  onClose: () => void;
}) {
  return (
    <DialogPrimitive.Root
      open={selection !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        {/* Lighter than the app's usual overlay — the tree behind this
            is the context, not something to be got out of the way. */}
        <DialogPrimitive.Overlay className="path-panel-overlay animate-overlay-in fixed inset-0 z-50 bg-black/25" />
        <DialogPrimitive.Content
          className={cn(
            "path-panel animate-sheet-up fixed inset-x-0 bottom-0 z-50 flex max-h-[86vh] flex-col rounded-t-2xl bg-surface-raised shadow-overlay focus:outline-none",
            "lg:animate-sheet-in lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[27rem] lg:rounded-none lg:rounded-l-2xl",
          )}
        >
          {selection?.kind === "node" && (
            // Keyed by the step: switching nodes REMOUNTS the body, so
            // the previous node's constellation and its selected
            // micro-node cannot linger under the new node's title. A
            // remount is also what keeps `loading` an initial state
            // rather than something an effect has to set synchronously.
            <NodePanelBody
              key={selection.node.step.id}
              pathSlug={pathSlug}
              node={selection.node}
              spec={selection.spec}
            />
          )}
          {selection?.kind === "branch" && (
            <BranchPanelBody branch={selection.branch} onSelect={onSelect} />
          )}
          <DialogPrimitive.Close className="path-panel-close absolute top-3 right-3 rounded-md p-1.5 text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function NodePanelBody({
  pathSlug,
  node,
  spec,
}: {
  pathSlug: string;
  node: TreeNode;
  spec: BranchSpec;
}) {
  const { step } = node;
  const Icon = STEP_ICON[step.kind];
  const unit = stepUnit(step.kind);

  const [detail, setDetail] = React.useState<StepDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [active, onActivate] = React.useState<MicroNode | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void loadPathStepDetail(pathSlug, step.id)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((error: unknown) => {
        // Never silent: a panel showing an empty constellation because a
        // query threw looks exactly like a learner with no progress,
        // which is the worst possible confusion this panel could cause.
        console.error("Loading path step detail failed", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathSlug, step.id]);

  return (
    <div
      className="path-panel-body flex min-h-0 flex-col"
      style={{ "--branch": spec.color } as React.CSSProperties}
    >
      <header className="path-panel-header border-b border-border px-5 pt-5 pb-4">
        <div className="flex items-start gap-3 pr-8">
          <span
            className="path-panel-icon grid size-11 shrink-0 place-items-center rounded-full"
            style={{
              background: "color-mix(in oklab, var(--branch) 20%, transparent)",
              color: "var(--branch)",
            }}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[1.0625rem] leading-snug font-semibold">
              {step.title}
            </DialogPrimitive.Title>
            <p className="mt-1 text-[0.78rem] text-fg-tertiary">
              <span style={{ color: "var(--branch)" }}>{spec.label}</span> ·{" "}
              {stepKindLabel(step.kind)} · node {node.tier + 1}
            </p>
          </div>
        </div>

        {step.detail && (
          <DialogPrimitive.Description className="mt-3 text-[0.9375rem] text-fg-secondary">
            {step.detail}
          </DialogPrimitive.Description>
        )}
        {!step.detail && (
          <DialogPrimitive.Description className="sr-only">
            {step.title}
          </DialogPrimitive.Description>
        )}

        <div className="path-panel-progress mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[0.9375rem] font-semibold tabular-nums">
              {banked(step)}{" "}
              <span className="text-fg-tertiary">/ {step.target}</span>{" "}
              <span className="text-[0.8125rem] font-normal text-fg-tertiary">
                {unit}
              </span>
            </span>
            <span className="text-[0.78rem] text-fg-tertiary">
              {step.complete
                ? "Done"
                : node.state === "next"
                  ? "Start here"
                  : `${step.percent}%`}
            </span>
          </div>
          <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${step.percent}%`,
                background: "var(--branch)",
              }}
            />
          </span>
        </div>
      </header>

      <div className="path-panel-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h3 className="text-[0.8125rem] font-semibold">What this is made of</h3>
        <p className="mt-1 text-[0.8125rem] text-fg-tertiary">
          Every circle is one real thing, lit by the same evidence the rest
          of the app uses. Tap one to see what it is.
        </p>

        {loading && (
          <div className="path-micro-skeleton mt-3 flex flex-wrap gap-1.5">
            {Array.from({ length: 18 }, (_, i) => (
              <span
                key={i}
                className="size-[18px] animate-pulse rounded-md bg-surface-hover"
              />
            ))}
          </div>
        )}

        {!loading && detail && (
          <>
            <div className="path-micro-grid mt-3 flex flex-wrap gap-1.5">
              {detail.nodes.map((micro) => (
                <button
                  key={micro.id}
                  type="button"
                  className="micro-node"
                  data-state={micro.state}
                  aria-pressed={active?.id === micro.id}
                  aria-label={`${micro.label} — ${detail.legend[micro.state]}`}
                  onClick={() =>
                    onActivate(active?.id === micro.id ? null : micro)
                  }
                />
              ))}
              {detail.nodes.length === 0 && (
                <p className="text-[0.8125rem] text-fg-secondary">
                  Nothing here yet.
                </p>
              )}
            </div>

            {/* The caption, not a tooltip: half the people reading this
                are on a phone, where hover does not exist. */}
            <p className="path-micro-caption mt-3 min-h-[2.5rem] rounded-lg bg-surface-hover px-3 py-2 text-[0.8125rem]">
              {active ? (
                <>
                  <span className="font-semibold">{active.label}</span>
                  {active.hint && (
                    <span className="text-fg-secondary"> — {active.hint}</span>
                  )}
                  <span className="block text-fg-tertiary">
                    {detail.legend[active.state]}
                  </span>
                </>
              ) : (
                <span className="text-fg-tertiary">
                  {countLine(detail.nodes, detail.legend)}
                </span>
              )}
            </p>

            <ul className="path-micro-legend mt-3 space-y-1 text-[0.78rem] text-fg-tertiary">
              {(["known", "started", "empty"] as MicroNodeState[]).map(
                (state) => (
                  <li key={state} className="flex items-center gap-2">
                    <span className="micro-node" data-state={state} />
                    {detail.legend[state]}
                  </li>
                ),
              )}
            </ul>

            {detail.note && (
              <p className="path-micro-note mt-3 text-[0.8125rem] text-fg-secondary">
                {detail.note}
              </p>
            )}
          </>
        )}

        <p className="mt-5 text-[0.78rem] text-fg-tertiary">
          Nothing on this tree is locked. This node is open whether it is
          your next one or three ahead — the order is a suggestion, and you
          are allowed to disagree with it.
        </p>
      </div>

      <footer className="path-panel-footer border-t border-border px-5 py-4">
        <Link
          href={stepHref(step)}
          className="path-cta flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[0.9375rem] font-semibold transition-opacity hover:opacity-90"
        >
          {stepCta(step.kind)}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </footer>
    </div>
  );
}

/** The default caption: how the constellation actually breaks down, so
 * the panel says something true before anything is selected. */
function countLine(
  nodes: MicroNode[],
  legend: Record<MicroNodeState, string>,
): string {
  if (nodes.length === 0) return "";
  const known = nodes.filter((node) => node.state === "known").length;
  const started = nodes.filter((node) => node.state === "started").length;
  const parts = [`${known} of ${nodes.length} ${legend.known}`];
  if (started > 0) parts.push(`${started} ${legend.started}`);
  return `${parts.join(" · ")}.`;
}

function BranchPanelBody({
  branch,
  onSelect,
}: {
  branch: TreeBranch;
  onSelect: (selection: TreeSelection) => void;
}) {
  const Icon = BRANCH_ICON[branch.spec.key];
  return (
    <div
      className="path-panel-body flex min-h-0 flex-col"
      style={{ "--branch": branch.spec.color } as React.CSSProperties}
    >
      <header className="path-panel-header border-b border-border px-5 pt-5 pb-4">
        <div className="flex items-start gap-3 pr-8">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full"
            style={{
              background: "color-mix(in oklab, var(--branch) 20%, transparent)",
              color: "var(--branch)",
            }}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <DialogPrimitive.Title
              className="text-[1.0625rem] font-semibold"
              style={{ color: "var(--branch)" }}
            >
              {branch.spec.label}
            </DialogPrimitive.Title>
            <p className="mt-0.5 text-[0.8125rem] text-fg-tertiary tabular-nums">
              {branch.done} of {branch.target} {branch.spec.unit} ·{" "}
              {branch.completeNodes} of {branch.nodes.length} nodes
            </p>
          </div>
        </div>
        <DialogPrimitive.Description className="mt-3 text-[0.9375rem] text-fg-secondary">
          {branch.spec.claim}
        </DialogPrimitive.Description>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <ul className="space-y-1.5">
          {branch.nodes.map((node) => (
            <li key={node.step.id}>
              <button
                type="button"
                className="path-branch-row flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left shadow-card transition-colors hover:bg-surface-hover"
                onClick={() =>
                  onSelect({ kind: "node", node, spec: branch.spec })
                }
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full text-[0.78rem] font-semibold tabular-nums"
                  style={{
                    background:
                      node.state === "complete"
                        ? "var(--branch)"
                        : "color-mix(in oklab, var(--branch) 14%, transparent)",
                    color:
                      node.state === "complete"
                        ? "var(--on-brand)"
                        : "var(--branch)",
                  }}
                >
                  {node.tier + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium">
                    {node.step.title}
                  </span>
                  <span className="block text-[0.78rem] text-fg-tertiary tabular-nums">
                    {banked(node.step)} /{" "}
                    {node.step.target} {stepUnit(node.step.kind)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
