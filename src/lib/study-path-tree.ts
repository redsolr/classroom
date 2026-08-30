import type { PathStepProgress } from "@/lib/study-progress";

/**
 * THE PATH, DRAWN AS A SKILL TREE.
 *
 * Pure geometry and pure branch assignment — no React, no DOM, no data
 * access. The component renders what this returns, which is why the
 * layout can be tested without a browser (`e2e/path-tree.spec.ts`).
 *
 * ── Why a tree and not a list ──────────────────────────────────────
 *
 * The spine this replaces was honest and unreadable at a glance: a
 * column of rows of equal weight, where the only thing visible from
 * across the room was which one was highlighted. A tree says the thing a
 * curriculum actually IS — three kinds of work growing at their own rate
 * off one root — and it says it in the one glance a learner gives a page
 * before deciding whether to open it.
 *
 * ── The three limbs are the three kinds of evidence ────────────────
 *
 * The branch is NOT a new column. It is derived from the step's kind,
 * because the kind already says what evidence completes the step, and a
 * separate `branch` field would be a second place to disagree with it:
 *
 *   pack        → VOCABULARY    words recalled on a later day
 *   sentences   → GRAMMAR       cloze cards: supplying the word in context
 *   chat/lesson → CONVERSATION  messages sent, lessons attended
 *
 * GRAMMAR is measured by cloze evidence, and that is a deliberate,
 * stated compromise rather than an oversight: a cloze card is the only
 * PRODUCTION-in-context measurement this app has, and supplying the
 * right word in the right slot is most of what beginner grammar is. It
 * is not a grammar-point curriculum. When one exists (a catalog of
 * points, cards tagged to them), this limb gets real per-point nodes and
 * the mapping here is the only thing that has to change — the residual
 * is written down in FEATURES.md rather than left implied.
 *
 * ── Nothing is locked, and the geometry may not imply otherwise ────
 *
 * A skill tree is the visual language of gated progression, which is
 * exactly the product we said we would not build. So: every node is a
 * button, every button opens, every panel links out — a node three tiers
 * up is as reachable as the first. What the tree encodes is ORDER and
 * KINSHIP (this follows from that; these two are the same kind of work),
 * never permission. There are no padlocks, and dimming means "you have
 * not done this yet", never "you may not".
 */

export type BranchKey = "vocabulary" | "grammar" | "conversation";

export type BranchSpec = {
  key: BranchKey;
  /** Shown under the hub in the branch's own colour. */
  label: string;
  /** What the hub's big number counts, in the learner's words. */
  unit: string;
  /** One line saying what evidence this limb is made of. */
  claim: string;
  kinds: PathStepProgress["kind"][];
  /** The limb's colour, as a token this app already ships. */
  color: string;
  /** Which way it grows off the trunk: -1 left, 0 straight up, 1 right. */
  lean: -1 | 0 | 1;
};

export const BRANCHES: BranchSpec[] = [
  {
    key: "vocabulary",
    label: "Vocabulary",
    unit: "words known",
    claim:
      "Words you have recalled on a later day — not words you saved. Saving fifty is not progress; getting them back on Thursday is.",
    kinds: ["pack"],
    color: "var(--success)",
    lean: -1,
  },
  {
    key: "grammar",
    label: "Grammar",
    unit: "sentences completed",
    claim:
      "Cloze cards: can you still supply the word when a sentence needs it? Recognising a word and producing one are different skills, and only the second transfers to speaking.",
    kinds: ["sentences"],
    color: "var(--warning)",
    lean: 0,
  },
  {
    key: "conversation",
    label: "Conversation",
    unit: "messages & lessons",
    claim:
      "The half cards cannot do: saying it to the tutor, then to a person. A path that is only flashcards teaches you to recognise words you have never said out loud.",
    kinds: ["chat", "lesson"],
    color: "var(--practice)",
    lean: 1,
  },
];

export function branchOf(kind: PathStepProgress["kind"]): BranchKey {
  const spec = BRANCHES.find((branch) => branch.kinds.includes(kind));
  // Every kind in the enum is mapped above; a kind added later without a
  // limb should land somewhere visible rather than vanish off the tree.
  return spec?.key ?? "conversation";
}

// ---------------------------------------------------------------------------
// Geometry. One coordinate space (TREE_WIDTH × computed height), origin
// top-left, tree growing UP from a root at the bottom. The component
// scales the whole thing and never recomputes these numbers, so what is
// tested here is what is drawn.
// ---------------------------------------------------------------------------

export const TREE_WIDTH = 1120;
/** Circle radius of a step node — the component's CSS uses the same. */
export const NODE_RADIUS = 38;
export const HUB_RADIUS = 54;

const CENTER = TREE_WIDTH / 2;
const BRANCH_SPREAD = 320;
// These two leave room for the LABELS under the hub and the root, not
// just their circles: the hub carries a name, a big number and a unit
// line, and the first cut clipped every one of them off the bottom of
// the canvas because the constants were measured to the disc.
const HUB_FROM_BOTTOM = 272;
const ROOT_FROM_BOTTOM = 112;
/** Hub → first node. Longer than a tier gap so the hub reads as a base. */
const FIRST_NODE_GAP = 152;
/** Tier spacing has to clear a two-line label AND the "start here" chip
 * that sits above the next node's disc — at 138 they collided. */
const TIER_GAP = 166;
/** Limbs lean further out as they climb, the way a real branch does. */
const TIER_DRIFT = 18;
/** Nodes alternate side to side so a limb reads as grown, not stacked. */
const ZIGZAG = 44;
const TOP_MARGIN = 120;

export type NodeState = "complete" | "next" | "started" | "untouched";

export type TreeNode = {
  step: PathStepProgress;
  branch: BranchKey;
  /** 0-based position along its own limb. */
  tier: number;
  x: number;
  y: number;
  state: NodeState;
  /**
   * The satellites drawn around the circle: the step's target cut into
   * equal chunks, each lit once the learner has banked it. A node worth
   * twenty words shows four pips of five, because twenty dots around a
   * 76px circle is decoration, not information.
   */
  pips: boolean[];
  /** What one pip is worth, in the step's own unit. */
  pipWorth: number;
};

export type TreeBranch = {
  spec: BranchSpec;
  hub: { x: number; y: number };
  nodes: TreeNode[];
  /** Banked toward this limb, capped per node — the hub's big number. */
  done: number;
  /** Everything this limb asks for. */
  target: number;
  completeNodes: number;
};

export type TreeLink = {
  d: string;
  branch: BranchKey;
  /** Lit when the node it leads TO is complete — the limb fills in as
   * the work lands, which is the whole reason to draw it. */
  lit: boolean;
};

export type PathTreeLayout = {
  width: number;
  height: number;
  root: { x: number; y: number };
  branches: TreeBranch[];
  links: TreeLink[];
};

function curve(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  // Vertical-tangent cubic: it leaves the lower node going straight up
  // and arrives at the upper one the same way, so junctions never kink.
  const bend = (from.y - to.y) * 0.45;
  return `M ${from.x} ${from.y} C ${from.x} ${from.y - bend}, ${to.x} ${to.y + bend}, ${to.x} ${to.y}`;
}

function pipsFor(step: PathStepProgress): { pips: boolean[]; worth: number } {
  const target = Math.max(1, step.target);
  const count = target <= 6 ? target : 5;
  const worth = target / count;
  return {
    pips: Array.from({ length: count }, (_, i) => step.done >= (i + 1) * worth),
    worth: Math.round(worth),
  };
}

function stateOf(
  step: PathStepProgress,
  nextId: string | undefined,
): NodeState {
  if (step.complete) return "complete";
  if (step.id === nextId) return "next";
  return step.done > 0 ? "started" : "untouched";
}

/**
 * Lay the path out. Steps arrive in the catalog's order and keep it
 * WITHIN a limb — the order still means something ("learn the core, then
 * widen"), it has just stopped meaning something BETWEEN limbs, where it
 * never did: nobody finishes all their vocabulary before their first
 * conversation, and a single column implied they should.
 */
export function buildPathTree(
  steps: PathStepProgress[],
  nextId?: string,
): PathTreeLayout {
  const grouped = BRANCHES.map((spec) => ({
    spec,
    steps: steps.filter((step) => branchOf(step.kind) === spec.key),
  }));

  const deepest = Math.max(1, ...grouped.map((group) => group.steps.length));
  const height =
    HUB_FROM_BOTTOM + FIRST_NODE_GAP + (deepest - 1) * TIER_GAP + TOP_MARGIN;
  const hubY = height - HUB_FROM_BOTTOM;
  const root = { x: CENTER, y: height - ROOT_FROM_BOTTOM };

  const branches: TreeBranch[] = [];
  const links: TreeLink[] = [];

  for (const { spec, steps: branchSteps } of grouped) {
    const hub = { x: CENTER + spec.lean * BRANCH_SPREAD, y: hubY };
    const nodes: TreeNode[] = branchSteps.map((step, tier) => {
      // The lean is capped: a limb that kept drifting would walk its
      // labels off the canvas on a long path, and a curve that keeps
      // curving reads as a mistake rather than as growth.
      const drift = spec.lean * Math.min(tier + 1, 4) * TIER_DRIFT;
      const swing = (tier % 2 === 0 ? -ZIGZAG : ZIGZAG) * (spec.lean || 1);
      const { pips, worth } = pipsFor(step);
      return {
        step,
        branch: spec.key,
        tier,
        x: hub.x + drift + swing,
        y: hubY - FIRST_NODE_GAP - tier * TIER_GAP,
        state: stateOf(step, nextId),
        pips,
        pipWorth: worth,
      };
    });

    const done = nodes.reduce(
      (sum, node) => sum + Math.min(node.step.done, node.step.target),
      0,
    );
    const target = nodes.reduce((sum, node) => sum + node.step.target, 0);

    branches.push({
      spec,
      hub,
      nodes,
      done,
      target,
      completeNodes: nodes.filter((node) => node.state === "complete").length,
    });

    // Trunk → hub, then hub → node → node up the limb. The trunk link
    // lights when anything on that limb is done: the root is where you
    // came from, so it has no "next" of its own to be honest about.
    links.push({
      d: curve(root, hub),
      branch: spec.key,
      lit: nodes.some((node) => node.state === "complete"),
    });
    let from: { x: number; y: number } = hub;
    for (const node of nodes) {
      links.push({
        d: curve(from, node),
        branch: spec.key,
        lit: node.state === "complete",
      });
      from = node;
    }
  }

  return { width: TREE_WIDTH, height, root, branches, links };
}
