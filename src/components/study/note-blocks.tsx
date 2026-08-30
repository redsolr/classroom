import { Check } from "lucide-react";
import {
  numberedPositions,
  parseBlocks,
  type NoteBlock,
} from "@/lib/notes/blocks";
import { BLOCK_TEXT } from "@/lib/notes/block-styles";
import { cn } from "@/lib/utils";

/**
 * A note, READ.
 *
 * Deliberately NOT a client component: the same markdown is rendered by
 * the notes tab (inside a client card), the book page, the reading page
 * and the PUBLIC shared-book page, and three of those four are server
 * components. A note that renders as blocks in the app and as raw
 * `- [ ] buy milk` on the link you shared would make the block editor
 * feel like a private toy.
 *
 * Read-only by construction — the checkbox is an `<input disabled>`
 * rather than a button, because a tick you can press but that never
 * saves is worse than one that plainly cannot be pressed.
 *
 * Keys are indexes on purpose: block ids come from a counter that is not
 * stable across a server and client render, and a read-only list that
 * never reorders has no need of them.
 */
export function NoteBlocks({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = parseBlocks(content);
  const numbers = numberedPositions(blocks);

  return (
    <div className={cn("note-blocks space-y-1.5", className)}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} number={numbers[i]} />
      ))}
    </div>
  );
}

function BlockView({ block, number }: { block: NoteBlock; number: number }) {
  switch (block.kind) {
    case "heading":
      return (
        <h3 className={cn(BLOCK_TEXT.heading, "tracking-tight")}>
          {block.text}
        </h3>
      );
    case "subheading":
      return (
        <h4 className={cn(BLOCK_TEXT.subheading, "tracking-tight")}>
          {block.text}
        </h4>
      );
    case "bullet":
      return (
        <div className={cn("flex gap-2.5", BLOCK_TEXT.bullet)}>
          <span
            aria-hidden
            className="mt-[0.55rem] block size-1.5 shrink-0 rounded-full bg-fg-tertiary"
          />
          <span className="min-w-0 whitespace-pre-wrap">{block.text}</span>
        </div>
      );
    case "numbered":
      return (
        <div className={cn("flex gap-2", BLOCK_TEXT.numbered)}>
          <span aria-hidden className="shrink-0 tabular-nums text-fg-tertiary">
            {number}.
          </span>
          <span className="min-w-0 whitespace-pre-wrap">{block.text}</span>
        </div>
      );
    case "todo":
      return (
        <div className={cn("flex gap-2.5", BLOCK_TEXT.todo)}>
          <span
            role="checkbox"
            aria-checked={block.checked ?? false}
            aria-disabled="true"
            aria-label={block.text || "To-do"}
            className={cn(
              "mt-1 flex size-4 shrink-0 items-center justify-center rounded border",
              block.checked
                ? "border-accent bg-accent text-white"
                : "border-border-strong text-transparent",
            )}
          >
            <Check className="size-3" />
          </span>
          <span
            className={cn(
              "min-w-0 whitespace-pre-wrap",
              block.checked && "text-fg-tertiary line-through",
            )}
          >
            {block.text}
          </span>
        </div>
      );
    case "quote":
      return (
        <blockquote
          className={cn(
            "border-l-2 border-border-strong pl-3 whitespace-pre-wrap",
            BLOCK_TEXT.quote,
          )}
        >
          {block.text}
        </blockquote>
      );
    case "code":
      return (
        <pre
          className={cn(
            "overflow-x-auto rounded-md bg-surface-hover px-3 py-2",
            BLOCK_TEXT.code,
          )}
        >
          {block.text}
        </pre>
      );
    case "divider":
      return <hr className="my-3 border-border" />;
    default:
      return (
        <p className={cn(BLOCK_TEXT.paragraph, "whitespace-pre-wrap")}>
          {block.text}
        </p>
      );
  }
}
