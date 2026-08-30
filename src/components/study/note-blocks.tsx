import { Check } from "lucide-react";
import { parseBlocks, type NoteBlock } from "@/lib/notes/blocks";
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

  return (
    <div className={cn("note-blocks space-y-1.5", className)}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} number={runIndex(blocks, i)} />
      ))}
    </div>
  );
}

function runIndex(blocks: NoteBlock[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index; i += 1) {
    if (blocks[i].kind === "numbered") n += 1;
    else n = 0;
  }
  return n;
}

function BlockView({ block, number }: { block: NoteBlock; number: number }) {
  switch (block.kind) {
    case "heading":
      return (
        <h3 className="text-[1.25rem] font-semibold tracking-tight">
          {block.text}
        </h3>
      );
    case "subheading":
      return (
        <h4 className="text-[1.0625rem] font-semibold tracking-tight">
          {block.text}
        </h4>
      );
    case "bullet":
      return (
        <div className="flex gap-2.5 text-[0.9375rem] leading-relaxed">
          <span
            aria-hidden
            className="mt-[0.55rem] block size-1.5 shrink-0 rounded-full bg-fg-tertiary"
          />
          <span className="min-w-0 whitespace-pre-wrap">{block.text}</span>
        </div>
      );
    case "numbered":
      return (
        <div className="flex gap-2 text-[0.9375rem] leading-relaxed">
          <span aria-hidden className="shrink-0 tabular-nums text-fg-tertiary">
            {number}.
          </span>
          <span className="min-w-0 whitespace-pre-wrap">{block.text}</span>
        </div>
      );
    case "todo":
      return (
        <div className="flex gap-2.5 text-[0.9375rem] leading-relaxed">
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
        <blockquote className="border-l-2 border-border-strong pl-3 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-fg-secondary italic">
          {block.text}
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md bg-surface-hover px-3 py-2 font-mono text-[0.875rem] leading-relaxed">
          {block.text}
        </pre>
      );
    case "divider":
      return <hr className="my-3 border-border" />;
    default:
      return (
        <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap">
          {block.text}
        </p>
      );
  }
}
