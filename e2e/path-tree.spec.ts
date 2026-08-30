import { expect, test } from "@playwright/test";
import {
  BRANCHES,
  HUB_RADIUS,
  TREE_WIDTH,
  TRUNK_LANE,
  branchOf,
  buildPathTree,
} from "../src/lib/study-path-tree";

/** The root's disc, which the layout does not own (it has no state to
 * carry) — the component draws it at 84px. */
const ROOT_RADIUS = 42;
import type { PathStepProgress } from "../src/lib/study-progress";

/**
 * THE TREE'S LAYOUT, as pure logic — no browser, no page fixture (the
 * same trick `note-blocks.spec.ts` uses; this repo has no unit runner
 * and one module does not justify a second test system).
 *
 * What these guard is everything about the tree that a screenshot cannot
 * tell you: that a step lands on the limb its evidence belongs to, that
 * two nodes never sit on top of each other at any path length, that a
 * limb's headline number counts each piece of evidence once, that the
 * trunk is three parallel cables rather than one stem, that limbs FORK
 * instead of running as a single chain, and that exactly one node is
 * ever "start here".
 */

let counter = 0;

function step(
  kind: PathStepProgress["kind"],
  done: number,
  target: number,
  packSlug?: string,
): PathStepProgress {
  counter += 1;
  const complete = done >= target;
  return {
    id: `step-${counter}`,
    pathId: "path-1",
    position: counter,
    kind,
    title: `${kind} ${counter}`,
    detail: null,
    packSlug:
      packSlug ??
      (kind === "pack" || kind === "sentences" ? `pack-${counter}` : null),
    target,
    done,
    complete,
    percent: Math.min(100, Math.round((done / target) * 100)),
  };
}

test("each step grows on the limb its evidence belongs to", () => {
  expect(branchOf("pack")).toBe("vocabulary");
  expect(branchOf("sentences")).toBe("grammar");
  expect(branchOf("chat")).toBe("conversation");
  expect(branchOf("lesson")).toBe("conversation");

  const steps = [
    step("pack", 0, 10),
    step("chat", 0, 10),
    step("sentences", 0, 8),
    step("pack", 0, 12),
    step("lesson", 0, 1),
  ];
  const tree = buildPathTree(steps);

  const byKey = new Map(tree.branches.map((b) => [b.spec.key, b]));
  expect(byKey.get("vocabulary")?.nodes).toHaveLength(2);
  expect(byKey.get("grammar")?.nodes).toHaveLength(1);
  expect(byKey.get("conversation")?.nodes).toHaveLength(2);

  // Catalog order survives WITHIN a limb — "learn the core, then widen"
  // still means something. It is only the order BETWEEN limbs that the
  // tree stops asserting, because nobody finishes all their vocabulary
  // before their first conversation.
  const vocab = byKey.get("vocabulary")?.nodes ?? [];
  expect(vocab.map((node) => node.step.position)).toEqual([1, 4]);
  expect(vocab.map((node) => node.tier)).toEqual([0, 1]);
});

test("the trunk is three parallel cables, not one stem", () => {
  const tree = buildPathTree([
    step("pack", 0, 10),
    step("sentences", 0, 8),
    step("chat", 0, 10),
  ]);

  const trunk = tree.links.filter((link) => link.kind === "trunk");
  expect(trunk).toHaveLength(3);
  expect(new Set(trunk.map((link) => link.branch)).size).toBe(3);

  // Each cable leaves the ROOT's own height, in its own lane, evenly
  // spaced — a bundle. Before this the three limbs shared one stem that
  // split, which drew well and said something we do not believe: that
  // the three kinds of work come from one source and diverge.
  const starts = trunk
    .map((link) => {
      const [, x, y] = /^M ([\d.-]+) ([\d.-]+)/.exec(link.d) ?? [];
      return { x: Number(x), y: Number(y) };
    })
    .sort((a, b) => a.x - b.x);

  for (const start of starts) expect(start.y).toBe(tree.root.y);
  expect(starts.map((s) => s.x)).toEqual([
    tree.root.x - TRUNK_LANE,
    tree.root.x,
    tree.root.x + TRUNK_LANE,
  ]);
  // A short path does not widen the canvas past its minimum.
  expect(tree.width).toBe(TREE_WIDTH);

  // And the bundle is narrow: the cables run side by side, they do not
  // leave from three different places.
  const span = starts[2].x - starts[0].x;
  expect(span).toBeLessThan(HUB_RADIUS * 2);
});

test("a limb forks instead of running as one chain", () => {
  // Fifteen nodes is the shipped Japanese vocabulary limb. As a chain
  // that is fifteen tiers, which on any real canvas fits to HEIGHT and
  // shrinks every node past the size where it is worth aiming at. Forked
  // it is nine, and the limb spends the room sideways instead.
  const steps = Array.from({ length: 15 }, () => step("pack", 0, 10));
  const tree = buildPathTree(steps);
  const vocab = tree.branches.find((b) => b.spec.key === "vocabulary");
  const nodes = vocab?.nodes ?? [];

  const tiers = Math.max(...nodes.map((node) => node.tier)) + 1;
  expect(tiers).toBeLessThan(nodes.length);

  // The shape that makes it a branch: tiers holding TWO nodes (the
  // strands) and tiers holding one (the junction they run back into).
  const perTier = new Map<number, number>();
  for (const node of nodes)
    perTier.set(node.tier, (perTier.get(node.tier) ?? 0) + 1);
  expect([...perTier.values()]).toContain(2);
  expect([...perTier.values()].filter((size) => size === 1).length).toBeGreaterThan(1);

  // A forked tier really does put its two nodes on opposite strands, and
  // a junction sits on the limb's own axis.
  for (const [tier, size] of perTier) {
    const row = nodes.filter((node) => node.tier === tier);
    if (size === 2) expect(row.map((n) => n.strand).sort()).toEqual([-1, 1]);
    else expect(row[0].strand).toBe(0);
  }

  // Every node is reachable: a fork is drawn, and so is the merge back.
  // A node with nothing leading to it would be a circle floating beside
  // the tree, which is exactly how a broken fork looks.
  const arrivals = new Set<string>();
  for (const link of tree.links) {
    const [, x, y] = /L ([\d.-]+) ([\d.-]+)$/.exec(link.d) ?? [];
    arrivals.add(`${Number(x)},${Number(y)}`);
  }
  for (const node of nodes) expect(arrivals).toContain(`${node.x},${node.y}`);
});

test("no two nodes ever overlap, at any path length", () => {
  // Eleven was the first Japanese path; thirty-seven is the shipped one;
  // sixty is well past anything we would author, and the geometry has to
  // hold there too or the first long path silently draws circles on top
  // of each other.
  for (const length of [3, 11, 37, 60]) {
    const steps = Array.from({ length }, (_, i) =>
      step((["pack", "sentences", "chat"] as const)[i % 3], 0, 10),
    );
    const tree = buildPathTree(steps);
    // Every circle with the radius it is actually drawn at: the root,
    // the three hubs, and each node (keystones and junctions are bigger
    // than strand nodes, so one shared radius would under-test exactly
    // the biggest ones).
    const points = [
      // `margin` is what each circle needs BESIDE it to stay unclipped:
      // a node only owns its rank pill, a hub carries its name and
      // headline number off to one side, and the root's caption is
      // centred under it.
      { ...tree.root, radius: ROOT_RADIUS, margin: ROOT_RADIUS + 90 },
      ...tree.branches.map((branch) => ({
        ...branch.hub,
        radius: HUB_RADIUS,
        margin: HUB_RADIUS + 170,
      })),
      ...tree.branches.flatMap((branch) =>
        branch.nodes.map((node) => ({ ...node, margin: node.radius + 10 })),
      ),
    ];

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const distance = Math.hypot(
          points[i].x - points[j].x,
          points[i].y - points[j].y,
        );
        expect(distance).toBeGreaterThan(
          points[i].radius + points[j].radius + 8,
        );
      }
    }

    // And every circle stays inside the canvas it is drawn on, with the
    // room its own caption needs.
    for (const point of points) {
      expect(point.x).toBeGreaterThan(point.margin);
      expect(point.x).toBeLessThan(tree.width - point.margin);
      expect(point.y).toBeGreaterThan(point.radius);
      expect(point.y).toBeLessThan(tree.height);
    }
  }
});

test("the canvas stays wider than it is tall, however long the path", () => {
  // The card the tree lives in is a wide rectangle. A canvas taller than
  // it is wide fits to HEIGHT, which shrinks every node below the size
  // where it is still a target and drops the whole tree into the phone's
  // pan-and-frame mode on a monitor. Forking is what buys this.
  for (const length of [11, 37, 60]) {
    const tree = buildPathTree(
      Array.from({ length }, (_, i) =>
        step((["pack", "sentences", "chat"] as const)[i % 3], 0, 10),
      ),
    );
    expect(tree.width).toBeGreaterThan(tree.height);
  }
});

test("a limb's headline counts each piece of evidence once", () => {
  // Overshooting a target is not extra credit: someone with 400 messages
  // has not banked 400 toward a path that asked for 10, and a hub that
  // said so would be the first number on the page nobody believed.
  const tree = buildPathTree([step("chat", 400, 10), step("lesson", 0, 1)]);
  const conversation = tree.branches.find(
    (branch) => branch.spec.key === "conversation",
  );
  expect(conversation?.done).toBe(10);
  expect(conversation?.target).toBe(11);

  // And nodes that read the SAME counter are counted once, at their
  // deepest. "Learn eight words of this book" and "finish it" are two
  // nodes over one fifteen-word book: the limb asks for fifteen words,
  // not twenty-three, and a learner who knows twelve has banked twelve
  // — not twenty. Every chat step counts the same messages, so those
  // collapse the same way.
  const stacked = buildPathTree([
    step("pack", 12, 8, "book-a"),
    step("pack", 12, 15, "book-a"),
    step("pack", 0, 20, "book-b"),
  ]);
  const vocabulary = stacked.branches.find(
    (branch) => branch.spec.key === "vocabulary",
  );
  expect(vocabulary?.target).toBe(35);
  expect(vocabulary?.done).toBe(12);
  // The nodes themselves still say their own thing: the first is done,
  // the second is not.
  expect(vocabulary?.completeNodes).toBe(1);
});

test("exactly one node is start-here, and it is never a padlock", () => {
  const first = step("pack", 10, 10);
  const second = step("sentences", 0, 8);
  const third = step("chat", 0, 10);
  const tree = buildPathTree([first, second, third], second.id);

  const nodes = tree.branches.flatMap((branch) => branch.nodes);
  expect(nodes.filter((node) => node.state === "next")).toHaveLength(1);
  expect(nodes.find((node) => node.state === "next")?.step.id).toBe(second.id);
  expect(nodes.find((node) => node.step.id === first.id)?.state).toBe(
    "complete",
  );
  // The step BEYOND the next one is untouched, not locked — there is no
  // fourth state, and that is the product decision, not an omission.
  expect(nodes.find((node) => node.step.id === third.id)?.state).toBe(
    "untouched",
  );
  expect(BRANCHES.map((branch) => branch.key)).toEqual([
    "vocabulary",
    "grammar",
    "conversation",
  ]);
});

test("a limb lights up only as far as the work has actually landed", () => {
  const done = step("pack", 10, 10);
  const partway = step("pack", 3, 10);
  const tree = buildPathTree([done, partway]);

  const lit = tree.links.filter((link) => link.lit);
  // Trunk → vocabulary hub, plus the one link into the completed node.
  expect(lit).toHaveLength(2);
  expect(lit.every((link) => link.branch === "vocabulary")).toBe(true);
});
