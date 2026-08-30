import { expect, test } from "@playwright/test";
import {
  BRANCHES,
  HUB_RADIUS,
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
 * limb's headline number cannot exceed what the limb actually asks for,
 * and that exactly one node is ever "start here".
 */

let counter = 0;

function step(
  kind: PathStepProgress["kind"],
  done: number,
  target: number,
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
    packSlug: kind === "pack" || kind === "sentences" ? "some-pack" : null,
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

test("no two nodes ever overlap, at any path length", () => {
  // Eleven nodes is the shipped Japanese path; twenty-four is well past
  // anything we would author, and the geometry has to hold there too or
  // the first long path silently draws circles on top of each other.
  for (const length of [3, 11, 24]) {
    const steps = Array.from({ length }, (_, i) =>
      step((["pack", "sentences", "chat"] as const)[i % 3], 0, 10),
    );
    const tree = buildPathTree(steps);
    // Every circle with the radius it is actually drawn at: the root,
    // the three hubs, and each node (keystones are bigger than the rest,
    // so one shared radius would under-test exactly the biggest ones).
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

test("a limb's headline number cannot exceed what the limb asks for", () => {
  // Overshooting a target is not extra credit: someone with 400 messages
  // has not banked 400 toward a path that asked for 10, and a hub that
  // said so would be the first number on the page nobody believed.
  const tree = buildPathTree([step("chat", 400, 10), step("lesson", 0, 1)]);
  const conversation = tree.branches.find(
    (branch) => branch.spec.key === "conversation",
  );
  expect(conversation?.done).toBe(10);
  expect(conversation?.target).toBe(11);
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
