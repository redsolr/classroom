import { expect, test } from "@playwright/test";
import {
  parseBlocks,
  shortcutFor,
  toMarkdown,
  type NoteBlock,
} from "../src/lib/notes/blocks";

/**
 * The block model, as pure logic — no browser, no page fixture.
 *
 * This repo has no unit-test runner, and adding one for a single module
 * would be a second test system to keep alive. A Playwright spec that
 * never touches `page` simply runs in Node, which is all these need.
 *
 * What they guard is the claim the whole storage decision rests on:
 * blocks are the EDITING model and markdown is the storage, so anything
 * the editor can produce has to survive a round trip. The moment it does
 * not, a learner loses a line by opening a note and closing it — the
 * worst failure this feature has, and a silent one.
 */

/** What the editor stores, re-read, and stored again. */
function roundTrip(markdown: string): string {
  return toMarkdown(parseBlocks(markdown));
}

test("every block kind survives a round trip", () => {
  const markdown = [
    "## Chapter 1",
    "### Vocabulary",
    "Plain paragraph text.",
    "- a bullet",
    "- another bullet",
    "1. first step",
    "2. second step",
    "- [ ] unticked",
    "- [x] ticked",
    "> something worth keeping verbatim",
    "---",
    "```",
    "const x = 1;",
    "```",
  ].join("\n");

  expect(roundTrip(markdown)).toBe(markdown);
});

test("a round trip is idempotent — twice changes nothing more than once", () => {
  const markdown = ["## Title", "- one", "- [x] done", "> quote"].join("\n");
  const once = roundTrip(markdown);
  expect(roundTrip(once)).toBe(once);
});

test("the parser reads each kind as itself", () => {
  const blocks = parseBlocks(
    ["## H", "- b", "1. n", "- [x] t", "> q", "---", "p"].join("\n"),
  );
  expect(blocks.map((b) => b.kind)).toEqual([
    "heading",
    "bullet",
    "numbered",
    "todo",
    "quote",
    "divider",
    "paragraph",
  ]);
  expect(blocks.find((b) => b.kind === "todo")?.checked).toBe(true);
});

test("a checkbox is not read as a bullet", () => {
  // `- [ ] x` matches the bullet pattern too, so ORDER in the pattern
  // list is load-bearing. Get it wrong and every to-do in every note
  // silently becomes a dash — and the tick state is gone.
  const [block] = parseBlocks("- [ ] buy milk");
  expect(block.kind).toBe("todo");
  expect(block.checked).toBe(false);
  expect(block.text).toBe("buy milk");
});

test("numbered lists are renumbered from their own run", () => {
  // The learner never maintains the number: it is derived from position,
  // so a list that follows a paragraph starts at 1 again and dragging an
  // item never leaves a gap.
  const blocks: NoteBlock[] = [
    { id: "1", kind: "numbered", text: "one" },
    { id: "2", kind: "numbered", text: "two" },
    { id: "3", kind: "paragraph", text: "break" },
    { id: "4", kind: "numbered", text: "one again" },
  ];
  expect(toMarkdown(blocks)).toBe(
    ["1. one", "2. two", "break", "1. one again"].join("\n"),
  );
});

test("blank lines are separation, not blocks", () => {
  // Keeping them as empty paragraphs would double every gap on each save
  // — a note that grows a blank line every time you open it.
  expect(parseBlocks("a\n\n\nb").map((b) => b.text)).toEqual(["a", "b"]);
  expect(roundTrip("a\n\n\nb")).toBe("a\nb");
});

test("code keeps its interior verbatim", () => {
  // Indentation inside code is content. A parser that trims it is a
  // parser that breaks the one block type where whitespace is meaning.
  const markdown = "```\n  indented\n\n  after a gap\n```";
  const [block] = parseBlocks(markdown);
  expect(block.kind).toBe("code");
  expect(block.text).toBe("  indented\n\n  after a gap");
  expect(roundTrip(markdown)).toBe(markdown);
});

test("an empty note still has somewhere to type", () => {
  expect(parseBlocks("")).toHaveLength(1);
  expect(parseBlocks("")[0].kind).toBe("paragraph");
});

test("markdown shortcuts map to the same kinds the menu offers", () => {
  expect(shortcutFor("## ")).toEqual({ kind: "heading", rest: "" });
  expect(shortcutFor("- ")).toEqual({ kind: "bullet", rest: "" });
  expect(shortcutFor("[] ")).toEqual({ kind: "todo", rest: "" });
  expect(shortcutFor("> ")).toEqual({ kind: "quote", rest: "" });
  // The prefix is eaten, and what the learner had already typed stays.
  expect(shortcutFor("- milk")).toEqual({ kind: "bullet", rest: "milk" });
  expect(shortcutFor("no shortcut here")).toBeNull();
});

test("### is not swallowed by ##", () => {
  // Longest-first matters: `### x` starts with `## `, so a shorter
  // pattern checked earlier would turn every subheading into a heading.
  expect(parseBlocks("### deep")[0].kind).toBe("subheading");
});
