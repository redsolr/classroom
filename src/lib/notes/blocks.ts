/**
 * NOTES AS BLOCKS — the editing model, over markdown storage.
 *
 * ── Why markdown stays the storage (2026-08-30) ─────────────────────
 *
 * `study_notes.content` is read as TEXT by eight things: the notes tab,
 * the book page, the reading list, the shared-book page, the search
 * index, the AI chat route (notes ride into the prompt), the `save note:`
 * chat tool, and the note actions. The chat tool is a first-class AUTHOR
 * of notes — "tell it to save what's worth keeping" is how most notes
 * get written here.
 *
 * A `study_note_blocks` table would have forked that: the tutor writing
 * markdown and the editor writing rows, two ways to make one note, which
 * is the exact shape this codebase keeps refusing (`notes.ts` will not
 * keep a second `createStudyBook`; `new-deck-dialog` is one component
 * because two had already drifted). So blocks are what the EDITOR works
 * in, and markdown is what is stored — parsed on open, serialised on
 * save, and every existing reader keeps working untouched.
 *
 * The trade is real and worth stating: anything markdown cannot express
 * — callout icons, block colour, columns, embedded databases — cannot be
 * stored. For notes about what you learned, that is not a loss. If a
 * block ever needs to carry data markdown has no syntax for, THAT is the
 * trigger to promote blocks to their own table, and this file is where
 * the parser to migrate them already lives.
 *
 * Round-trip rule: `toMarkdown(parseBlocks(md))` must equal `md` for
 * anything this file can produce. `blocks.spec.ts` holds that.
 */

export type BlockKind =
  | "paragraph"
  | "heading"
  | "subheading"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "divider";

export type NoteBlock = {
  /** Stable within an editing session only — never persisted. */
  id: string;
  kind: BlockKind;
  text: string;
  /** `todo` only: whether the box is ticked. */
  checked?: boolean;
};

/** Blocks that hold no text — Enter past them makes a paragraph. */
export const EMPTY_BLOCKS: ReadonlySet<BlockKind> = new Set(["divider"]);

let seq = 0;
/**
 * Ids are a render concern, not data.
 *
 * Deliberately a counter rather than `crypto.randomUUID()`: this runs in
 * a component that React may render on the server first, and an id that
 * differs between the two renders is a hydration mismatch. A counter
 * seeded per module is stable for a given parse.
 */
export function blockId(): string {
  seq += 1;
  return `b${seq}`;
}

export function emptyBlock(kind: BlockKind = "paragraph"): NoteBlock {
  return { id: blockId(), kind, text: "", ...(kind === "todo" && { checked: false }) };
}

const PATTERNS: { re: RegExp; kind: BlockKind; checked?: boolean }[] = [
  // Todo before bullet: `- [ ] x` is also a valid bullet, and the more
  // specific pattern has to win or every checkbox reads as a dash.
  { re: /^[-*]\s+\[\s\]\s+/, kind: "todo", checked: false },
  { re: /^[-*]\s+\[[xX]\]\s+/, kind: "todo", checked: true },
  { re: /^###\s+/, kind: "subheading" },
  { re: /^##\s+/, kind: "heading" },
  { re: /^[-*]\s+/, kind: "bullet" },
  { re: /^\d+\.\s+/, kind: "numbered" },
  { re: /^>\s?/, kind: "quote" },
];

/**
 * Markdown → blocks.
 *
 * Line-based, because that is what the block model is. A fenced code
 * block is the one construct that spans lines, so it is handled first
 * and its interior is taken verbatim — indentation inside code is
 * content, not formatting.
 */
export function parseBlocks(markdown: string): NoteBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: NoteBlock[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^```/.test(line.trim())) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({ id: blockId(), kind: "code", text: body.join("\n") });
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) {
      blocks.push({ id: blockId(), kind: "divider", text: "" });
      continue;
    }

    // A blank line between blocks is separation, not a block. Preserving
    // it as an empty paragraph would double every gap on each save.
    if (line.trim() === "") continue;

    const match = PATTERNS.find((p) => p.re.test(line));
    if (match) {
      blocks.push({
        id: blockId(),
        kind: match.kind,
        text: line.replace(match.re, ""),
        ...(match.kind === "todo" && { checked: match.checked }),
      });
      continue;
    }

    blocks.push({ id: blockId(), kind: "paragraph", text: line });
  }

  return blocks.length > 0 ? blocks : [emptyBlock()];
}

/** One block → its markdown line(s). */
function lineFor(block: NoteBlock, numberedIndex: number): string {
  switch (block.kind) {
    case "heading":
      return `## ${block.text}`;
    case "subheading":
      return `### ${block.text}`;
    case "bullet":
      return `- ${block.text}`;
    case "numbered":
      return `${numberedIndex}. ${block.text}`;
    case "todo":
      return `- [${block.checked ? "x" : " "}] ${block.text}`;
    case "quote":
      return `> ${block.text}`;
    case "code":
      return "```\n" + block.text + "\n```";
    case "divider":
      return "---";
    default:
      return block.text;
  }
}

/**
 * Blocks → markdown.
 *
 * Numbered lists are renumbered from their RUN, not from the document:
 * a list that follows a paragraph starts at 1 again, and dragging an
 * item never leaves a gap in the sequence. The number is presentation
 * derived from position, never something the learner maintains.
 */
export function toMarkdown(blocks: NoteBlock[]): string {
  const lines: string[] = [];
  let run = 0;

  for (const block of blocks) {
    if (block.kind === "numbered") run += 1;
    else run = 0;
    // An empty paragraph is a block the learner made and then left
    // blank; it carries no text and would serialise to a blank line
    // that `parseBlocks` then throws away, so drop it here instead of
    // letting the round-trip do it silently.
    if (block.kind === "paragraph" && block.text.trim() === "") continue;
    lines.push(lineFor(block, run));
  }

  return lines.join("\n");
}

/**
 * The `/` menu, and the markdown shortcuts that do the same job.
 *
 * Both are here so the two ways of reaching a block type cannot disagree
 * about what the types ARE — a slash menu offering something the
 * shortcut does not produce is how the two drift.
 */
export const BLOCK_MENU: {
  kind: BlockKind;
  label: string;
  hint: string;
  /** Typed at the start of a block, converts it. */
  shortcut?: string;
}[] = [
  { kind: "paragraph", label: "Text", hint: "Plain paragraph" },
  { kind: "heading", label: "Heading", hint: "Section title", shortcut: "## " },
  { kind: "subheading", label: "Subheading", hint: "Smaller title", shortcut: "### " },
  { kind: "bullet", label: "Bulleted list", hint: "One point per line", shortcut: "- " },
  { kind: "numbered", label: "Numbered list", hint: "Ordered steps", shortcut: "1. " },
  { kind: "todo", label: "To-do", hint: "A box you can tick", shortcut: "[] " },
  { kind: "quote", label: "Quote", hint: "Something worth keeping verbatim", shortcut: "> " },
  { kind: "code", label: "Code", hint: "Monospaced, kept as typed", shortcut: "``` " },
  { kind: "divider", label: "Divider", hint: "A line between sections", shortcut: "--- " },
];

/**
 * Does what the learner just typed turn this block into another kind?
 *
 * Returns the new kind and the text with the prefix eaten, or null. The
 * check runs on every keystroke, so it is a plain prefix match rather
 * than a parse.
 */
export function shortcutFor(
  text: string,
): { kind: BlockKind; rest: string } | null {
  for (const item of BLOCK_MENU) {
    if (item.shortcut && text.startsWith(item.shortcut)) {
      return { kind: item.kind, rest: text.slice(item.shortcut.length) };
    }
  }
  return null;
}
