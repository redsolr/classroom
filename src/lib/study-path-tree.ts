import { banked } from "@/lib/study-path-steps";
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

const BRANCH_BY_KEY = new Map(BRANCHES.map((branch) => [branch.key, branch]));

/** The limb itself, by key — so nothing has to scan `BRANCHES` (or worse,
 * a laid-out tree's branches) to answer "what colour is this". */
export function branchSpec(key: BranchKey): BranchSpec {
  const spec = BRANCH_BY_KEY.get(key);
  if (!spec) throw new Error(`Unknown learning-path branch: ${key}`);
  return spec;
}

/** A limb's colour. Two call sites were each finding it by scanning a
 * laid-out tree, which meant the LAYOUT had to be in hand to answer a
 * question about the catalog. */
export function branchColor(key: BranchKey): string {
  return branchSpec(key).color;
}

export function branchOf(kind: PathStepProgress["kind"]): BranchKey {
  const spec = BRANCHES.find((branch) => branch.kinds.includes(kind));
  // Every kind in the enum is mapped above; a kind added later without a
  // limb should land somewhere visible rather than vanish off the tree.
  return spec?.key ?? "conversation";
}

// ---------------------------------------------------------------------------
// Geometry. One coordinate space, both dimensions computed from how deep
// the limbs go, origin top-left, tree growing UP from a root at the
// bottom. The component
// scales the whole thing and never recomputes these numbers, so what is
// tested here is what is drawn.
// ---------------------------------------------------------------------------

/**
 * The canvas's MINIMUM width — it grows from here when the limbs need
 * the room (see `reach` in the layout). Deliberately wide, roughly 16:9,
 * because the card it is drawn in is: the first cut was 1120×1040, near
 * square, so on a monitor it fitted to the card's HEIGHT and left a
 * third of the width empty on either side — a small tree marooned in a
 * big panel.
 */
export const TREE_WIDTH = 2200;
/**
 * THREE node sizes, the way the reference art does it — and each one
 * means something structural rather than decorative:
 *
 *   KEYSTONE  the first node on a limb: the foundation the rest of it
 *             is built on, and where we would point a beginner.
 *   JUNCTION  a node the limb's two strands both run into. It is where
 *             the branch is a single cable again, so it carries the
 *             weight of everything feeding it.
 *   NODE      a node on one of the two strands.
 *
 * Size is STRUCTURE, never permission: a junction is not a gate, and
 * nothing behind it is locked. A tree of identical circles has no anchor
 * for the eye to start from, which is most of why a dense tree of one
 * size reads as scatter.
 */
export const NODE_RADIUS = 26;
export const JUNCTION_RADIUS = 38;
export const KEYSTONE_RADIUS = 48;
export const HUB_RADIUS = 64;

const BRANCH_SPREAD = 600;
// Room for the TRUNK SECTION between the root and the hubs — the three
// cables run side by side through it — and for the root's own caption
// below. The hubs' captions need no vertical room here: they sit BESIDE
// their disc, off the trunk.
const HUB_FROM_BOTTOM = 440;
const ROOT_FROM_BOTTOM = 100;
/** Hub → first tier. Longer than a tier gap so the hub reads as a base. */
const FIRST_NODE_GAP = 134;
/** Tiers pack tightly: nodes carry an icon and a rank pill, not a
 * caption, so there is nothing between them that needs room. */
const TIER_RISE = 88;
/** Limbs lean further out as they climb, the way a real branch does.
 * Uncapped now — the canvas is wide enough to let a long limb keep
 * walking outward, and a lean that stops looks like a mistake. */
const TIER_RUN = 42;
/**
 * The two STRANDS a limb runs on, either side of its own axis. A tier
 * holding two nodes puts one on each; a tier holding one is a junction
 * sitting on the axis itself, which is what closes the diamond.
 */
const STRAND = 84;
const TOP_MARGIN = 70;
/** Corner radius where an elbow turns. Big enough to read as a cable
 * bend, small enough that it never becomes a curve. */
const BEND = 24;
/**
 * THE TRUNK IS THREE PARALLEL CABLES, NOT ONE STEM.
 *
 * The reference's trunk is a bundle: three coloured lines running side
 * by side out of the bottom of the frame, each already belonging to its
 * own limb. Ours was a single stem that split — which drew better than
 * three columns sharing a bottom edge, but said something we do not
 * believe: that the three kinds of work come from one source and
 * diverge. They do not. Vocabulary, grammar and conversation run in
 * parallel from the first day, and the trunk now says so.
 *
 * `TRUNK_LANE` is the gap between neighbouring cables in the bundle;
 * `TRUNK_RUN` is how far they run parallel before splaying to their
 * hubs. The run is long on purpose — it is the stretch that reads as a
 * trunk rather than as three cables that happen to start near each
 * other.
 */
export const TRUNK_LANE = 40;
const TRUNK_RUN = 250;

export type NodeState = "complete" | "next" | "started" | "untouched";

export type TreeNode = {
  step: PathStepProgress;
  branch: BranchKey;
  /** 0-based tier along its own limb. A tier holds one node or two. */
  tier: number;
  /**
   * Which strand it sits on: `-1` inner (toward the trunk), `1` outer,
   * `0` on the limb's own axis — which is what a junction and a keystone
   * are. The component does not use it; the layout spec does, to prove
   * the limb actually forks rather than merely zig-zagging.
   */
  strand: -1 | 0 | 1;
  x: number;
  y: number;
  state: NodeState;
  /** Disc radius — keystone, junction or strand node. See the sizes. */
  radius: number;
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
  /**
   * `trunk` is the limb's own cable through the bundle at the bottom;
   * `limb` is everything above the hub. Named rather than inferred so
   * the layout spec can prove the trunk is three parallel cables and not
   * one stem — the thing that most makes this read as the reference.
   */
  kind: "trunk" | "limb";
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

/**
 * ELBOW ROUTING — straight runs, one horizontal step, rounded corners.
 * The git-graph shape, and the single biggest reason the reference reads
 * as a skill tree rather than a mind map.
 *
 * The first cut used vertical-tangent cubics. They were smooth and they
 * were WRONG: every cable had its own personality, so eleven of them
 * looked like spilled string. An elbow is predictable — up, across, up —
 * which is what lets a person trace a limb with their eye instead of
 * following it.
 */
function elbow(
  from: { x: number; y: number },
  to: { x: number; y: number },
  /**
   * Where the horizontal run happens. Defaults to halfway, which is
   * right for node-to-node. The TRUNK passes its own: the three limbs
   * have to split low, just above the root, or the split happens at the
   * hubs' own height and draws a line straight through them.
   */
  junction?: number,
): string {
  const dx = to.x - from.x;
  if (Math.abs(dx) < 2) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

  const midY = junction ?? (from.y + to.y) / 2;
  const direction = Math.sign(dx);
  // Never let a corner eat more than half the run it turns into, or a
  // short hop draws a bend that overshoots its own endpoint.
  const bend = Math.min(
    BEND,
    Math.abs(dx) / 2,
    Math.abs(from.y - midY),
    Math.abs(midY - to.y),
  );

  return [
    `M ${from.x} ${from.y}`,
    `L ${from.x} ${midY + bend}`,
    `Q ${from.x} ${midY} ${from.x + direction * bend} ${midY}`,
    `L ${to.x - direction * bend} ${midY}`,
    `Q ${to.x} ${midY} ${to.x} ${midY - bend}`,
    `L ${to.x} ${to.y}`,
  ].join(" ");
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

  const tallest = Math.max(
    1,
    ...grouped.map((group) => tierSizes(group.steps.length).length),
  );
  const height =
    HUB_FROM_BOTTOM + FIRST_NODE_GAP + (tallest - 1) * TIER_RISE + TOP_MARGIN;
  const hubY = height - HUB_FROM_BOTTOM;
  /**
   * The canvas is `TREE_WIDTH` unless the limbs have outgrown it. A limb
   * leans further out with every tier it climbs, so a long path needs a
   * wider canvas — and widening it is the right answer, because the card
   * scales the whole tree to fit. The alternative, which this replaced,
   * was to STOP the lean after four tiers: it kept everything on a fixed
   * canvas and made every long limb bend and then go rigid, which reads
   * as a mistake rather than as growth.
   */
  const reach =
    BRANCH_SPREAD + tallest * TIER_RUN + STRAND + KEYSTONE_RADIUS + 60;
  const width = Math.max(TREE_WIDTH, reach * 2);
  const center = width / 2;
  const root = { x: center, y: height - ROOT_FROM_BOTTOM };
  /** Where the parallel bundle ends and each cable peels off to its hub. */
  const splayY = root.y - TRUNK_RUN;

  const branches: TreeBranch[] = [];
  const links: TreeLink[] = [];

  for (const { spec, steps: branchSteps } of grouped) {
    const hub = { x: center + spec.lean * BRANCH_SPREAD, y: hubY };
    // Which way this limb walks as it climbs. The centre limb has no
    // outward side, so it grows straight up and uses the right-hand
    // strand as its "outer".
    const out = spec.lean || 1;

    const sizes = tierSizes(branchSteps.length);
    const nodes: TreeNode[] = [];
    /** Tier index → the nodes on it, so links can be drawn tier to tier. */
    const rows: TreeNode[][] = [];
    let taken = 0;

    sizes.forEach((size, tier) => {
      const axisX = hub.x + spec.lean * (tier + 1) * TIER_RUN;
      const y = hubY - FIRST_NODE_GAP - tier * TIER_RISE;
      const row: TreeNode[] = [];

      for (let slot = 0; slot < size; slot += 1) {
        const step = branchSteps[taken];
        taken += 1;
        // A tier of one sits ON the axis — keystone or junction. A tier
        // of two puts its FIRST step on the inner strand, so catalog
        // order still reads outward from the trunk.
        const strand: -1 | 0 | 1 =
          size === 1 ? 0 : slot === 0 ? -1 : 1;
        const node: TreeNode = {
          step,
          branch: spec.key,
          tier,
          strand,
          x: axisX + strand * out * STRAND,
          y,
          state: stateOf(step, nextId),
          radius:
            tier === 0
              ? KEYSTONE_RADIUS
              : size === 1
                ? JUNCTION_RADIUS
                : NODE_RADIUS,
        };
        row.push(node);
        nodes.push(node);
      }

      rows.push(row);
    });

    /**
     * A LIMB'S HEADLINE COUNTS DISTINCT EVIDENCE, NOT A SUM OF STEPS.
     *
     * Several nodes can read the same counter. "Learn eight words of
     * this book" and "finish it" both count words known from one book;
     * every chat step counts the same messages you have ever sent. Add
     * their targets up and the hub asks for 218 words from a language
     * that ships 146, and counts one message five times on the way
     * there — a number nobody can trace, which is the one thing this
     * app's statistics may never be.
     *
     * So steps that share a counter — same kind, same book — are
     * grouped, and the group contributes the DEEPEST target in it. The
     * bug was invisible while a limb held four nodes on four different
     * books; it is the first thing that breaks when a limb holds
     * fifteen.
     */
    const counters = new Map<string, { done: number; target: number }>();
    for (const node of nodes) {
      const key = `${node.step.kind}:${node.step.packSlug ?? ""}`;
      const counter = counters.get(key);
      if (!counter) {
        counters.set(key, { done: node.step.done, target: node.step.target });
      } else {
        counter.done = Math.max(counter.done, node.step.done);
        counter.target = Math.max(counter.target, node.step.target);
      }
    }
    let done = 0;
    let target = 0;
    for (const counter of counters.values()) {
      done += banked(counter);
      target += counter.target;
    }

    branches.push({
      spec,
      hub,
      nodes,
      done,
      target,
      completeNodes: nodes.filter((node) => node.state === "complete").length,
    });

    // THE TRUNK: this limb's own cable, running up its lane in the
    // bundle before peeling off to its hub. It lights when anything on
    // the limb is done — the root is where you came from, so it has no
    // "next" of its own to be honest about.
    links.push({
      d: elbow(
        { x: center + spec.lean * TRUNK_LANE, y: root.y },
        hub,
        splayY,
      ),
      branch: spec.key,
      kind: "trunk",
      lit: nodes.some((node) => node.state === "complete"),
    });

    // Hub → first tier, then tier to tier. Where a tier of one meets a
    // tier of two the cable FORKS (or merges); where two meet two the
    // strands run parallel. That is what draws the reference's diamonds,
    // and it is why a fifteen-node limb is eight tiers tall instead of
    // fifteen.
    for (const node of rows[0] ?? []) {
      links.push({
        d: elbow(hub, node),
        branch: spec.key,
        kind: "limb",
        lit: node.state === "complete",
      });
    }
    for (let tier = 0; tier + 1 < rows.length; tier += 1) {
      for (const to of rows[tier + 1]) {
        for (const from of rows[tier]) {
          // Two strands stay two strands: inner feeds inner, outer feeds
          // outer. Cross-linking them would draw an X through the middle
          // of every pair and say nothing.
          if (from.strand !== 0 && to.strand !== 0 && from.strand !== to.strand)
            continue;
          links.push({
            d: elbow(from, to),
            branch: spec.key,
            kind: "limb",
            lit: to.state === "complete",
          });
        }
      }
    }
  }

  return { width, height, root, branches, links };
}

/**
 * How a limb's nodes divide into tiers: one keystone, then a repeating
 * fork-fork-merge. The last tier takes whatever is left.
 *
 * The pattern is what turns a limb from a CHAIN into a branch. A chain
 * of fifteen nodes is fifteen tiers tall, which on any real canvas fits
 * to height and shrinks every node past the size where it is still worth
 * aiming at — the same trap the near-square first canvas fell into, in
 * the other axis. Forked, the same fifteen nodes are eight tiers, and
 * the limb spends the room sideways where there is room to spend.
 */
function tierSizes(count: number): number[] {
  if (count <= 0) return [];
  const sizes = [1];
  let left = count - 1;
  const pattern = [2, 2, 1];
  for (let i = 0; left > 0; i += 1) {
    const take = Math.min(pattern[i % pattern.length], left);
    sizes.push(take);
    left -= take;
  }
  return sizes;
}
