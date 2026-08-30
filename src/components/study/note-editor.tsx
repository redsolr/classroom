"use client";

import * as React from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  BLOCK_MENU,
  emptyBlock,
  numberedPositions,
  parseBlocks,
  shortcutFor,
  toMarkdown,
  type BlockKind,
  type NoteBlock,
} from "@/lib/notes/blocks";
import { BLOCK_TEXT } from "@/lib/notes/block-styles";
import { cn } from "@/lib/utils";

/**
 * THE BLOCK EDITOR — Notion's shape, over markdown storage.
 *
 * ── Why textareas and not contenteditable ───────────────────────────
 *
 * Every block is a real `<textarea>`. That is the load-bearing decision
 * in this file, and it is about IME: this app's first user studies
 * Japanese, and the whole product is people typing in languages that
 * need composition. A contenteditable surface with Enter-to-split has to
 * reimplement caret handling, selection and composition, and the failure
 * mode is that Enter COMMITS the IME conversion and splits the block at
 * the same time — you get half a word in a new paragraph, mid-sentence.
 *
 * A form control gets all of that from the browser for free. What it
 * costs is inline formatting (bold inside a line), which markdown
 * storage would have carried but which study notes have not once needed.
 * When they do, the answer is ProseMirror, not a hand-rolled caret.
 *
 * Every Enter/Backspace handler still guards `isComposing` — the same
 * guard `study-chat.tsx` and `inline-rename-input.tsx` already use,
 * because a keystroke that is closing an IME candidate window is not a
 * keystroke the editor is allowed to act on.
 */

/** How long after the last keystroke the note is written. */
const SAVE_DEBOUNCE_MS = 700;

/** What a caller can make the editor do — see `flush`. */
export type NoteEditorHandle = {
  /**
   * Write anything the debounce is still holding, and wait for it.
   *
   * A "Done" button that closes an autosaving editor is a race: press it
   * inside the debounce window and the edit is thrown away, which is the
   * one failure a notes feature may not have. Done awaits this first.
   */
  flush: () => Promise<void>;
};

export function NoteBlockEditor({
  ref,
  initialContent,
  onSave,
  placeholder = "Write what you learned…",
}: {
  ref?: React.Ref<NoteEditorHandle>;
  initialContent: string;
  /** Persist markdown. Debounced by the editor; must be idempotent. */
  onSave: (markdown: string) => Promise<void> | void;
  placeholder?: string;
}) {
  const [blocks, setBlocks] = React.useState<NoteBlock[]>(() =>
    parseBlocks(initialContent),
  );
  const [menuFor, setMenuFor] = React.useState<string | null>(null);
  const inputs = React.useRef(new Map<string, HTMLTextAreaElement>());
  /** The block to focus after the next render, and where to put the caret. */
  const pendingFocus = React.useRef<{ id: string; caret: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Saving ────────────────────────────────────────────────────────
  // The markdown of the LAST save, so an edit that serialises to what is
  // already stored (toggling a block type back, say) writes nothing.
  const saved = React.useRef(initialContent);
  // Held in a ref so a new `onSave` identity from the parent's render
  // does not restart the debounce and delay the write. Assigned in an
  // effect, never during render — a ref written mid-render is impure and
  // `react-hooks/refs` is right to refuse it.
  const onSaveRef = React.useRef(onSave);
  React.useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  /** One write, shared by the debounce and by `flush`. */
  const write = React.useCallback(async (markdown: string) => {
    if (markdown === saved.current) return;
    saved.current = markdown;
    try {
      await onSaveRef.current(markdown);
    } catch (error) {
      // Keep the text on screen — the learner's words are not ours to
      // discard because a write failed. The next keystroke retries,
      // because `saved` only advances past a success.
      saved.current = "";
      console.error("notes: failed to save the note", error);
    }
  }, []);

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // The latest blocks, readable from a callback that must not be
  // re-created on every keystroke (blur handlers, unmount cleanup).
  const blocksRef = React.useRef(blocks);
  React.useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  /**
   * Write now, whatever the debounce is holding.
   *
   * Called three ways, and it needs all three: the caller's Done button,
   * unmount, and BLUR. Blur is the one that matters most — it is what
   * happens when the learner clicks anything outside the block they were
   * typing in, so an edit becomes durable the moment attention leaves it
   * rather than 700ms later. Leaning on the debounce alone made "type,
   * then click Done" a race the learner could win.
   */
  const flushNow = React.useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await write(toMarkdown(blocksRef.current));
  }, [write]);

  React.useImperativeHandle(ref, () => ({ flush: flushNow }), [flushNow]);

  // Unmount is the last chance — closing the card, navigating away.
  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void write(toMarkdown(blocksRef.current));
    },
    [write],
  );

  React.useEffect(() => {
    const markdown = toMarkdown(blocks);
    if (markdown === saved.current) return;
    const timer = setTimeout(() => {
      void write(markdown);
    }, SAVE_DEBOUNCE_MS);
    timerRef.current = timer;
    return () => clearTimeout(timer);
  }, [blocks, write]);

  // Focus is applied after the DOM has the new block, never inside the
  // state updater — the node does not exist yet at that point.
  React.useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const node = inputs.current.get(target.id);
    if (!node) return;
    node.focus();
    node.setSelectionRange(target.caret, target.caret);
  }, [blocks]);

  const focusBlock = (id: string, caret: number) => {
    pendingFocus.current = { id, caret };
  };

  const patch = (id: string, next: Partial<NoteBlock>) =>
    setBlocks((current) =>
      current.map((b) => (b.id === id ? { ...b, ...next } : b)),
    );

  /** Enter: split the block at the caret. The tail becomes a new one. */
  const splitAt = (id: string, caret: number) => {
    setBlocks((current) => {
      const index = current.findIndex((b) => b.id === id);
      if (index === -1) return current;
      const block = current[index];
      const head = block.text.slice(0, caret);
      const tail = block.text.slice(caret);

      // Enter on an EMPTY list item ends the list rather than making
      // another one — the way every editor behaves, and the only way to
      // get out of a list without reaching for the mouse.
      if (block.text === "" && block.kind !== "paragraph") {
        const next = [...current];
        next[index] = { ...block, kind: "paragraph", checked: undefined };
        focusBlock(block.id, 0);
        return next;
      }

      // A new block CONTINUES a list, and starts fresh after anything
      // else: pressing Enter under a heading wants a paragraph, not a
      // second heading.
      const carried: BlockKind =
        block.kind === "bullet" ||
        block.kind === "numbered" ||
        block.kind === "todo"
          ? block.kind
          : "paragraph";
      const fresh: NoteBlock = {
        ...emptyBlock(carried),
        text: tail,
      };
      focusBlock(fresh.id, 0);
      return [
        ...current.slice(0, index),
        { ...block, text: head },
        fresh,
        ...current.slice(index + 1),
      ];
    });
  };

  /**
   * Backspace at the very start.
   *
   * Two steps, in Notion's order: the first press strips the block's
   * KIND (a bullet becomes a paragraph), and only a second press merges
   * it upward. Merging straight away makes it far too easy to destroy
   * the line above while trying to un-bullet the one you are on.
   */
  const backspaceAtStart = (id: string) => {
    setBlocks((current) => {
      const index = current.findIndex((b) => b.id === id);
      if (index === -1) return current;
      const block = current[index];

      if (block.kind !== "paragraph") {
        const next = [...current];
        next[index] = { ...block, kind: "paragraph", checked: undefined };
        focusBlock(block.id, 0);
        return next;
      }
      if (index === 0) return current;

      const previous = current[index - 1];
      // A divider has no text to merge into; Backspace removes it and
      // leaves the caret where it was.
      if (previous.kind === "divider") {
        focusBlock(block.id, 0);
        return [...current.slice(0, index - 1), ...current.slice(index)];
      }
      focusBlock(previous.id, previous.text.length);
      const merged = { ...previous, text: previous.text + block.text };
      return [
        ...current.slice(0, index - 1),
        merged,
        ...current.slice(index + 1),
      ];
    });
  };

  const convert = (id: string, kind: BlockKind, rest?: string) => {
    setBlocks((current) =>
      current.map((b) =>
        b.id === id
          ? {
              ...b,
              kind,
              text: rest ?? b.text,
              checked: kind === "todo" ? (b.checked ?? false) : undefined,
            }
          : b,
      ),
    );
    setMenuFor(null);
    focusBlock(id, rest?.length ?? 0);
  };

  const removeBlock = (id: string) =>
    setBlocks((current) => {
      const next = current.filter((b) => b.id !== id);
      return next.length > 0 ? next : [emptyBlock()];
    });

  const addBlockAfter = (id: string) =>
    setBlocks((current) => {
      const index = current.findIndex((b) => b.id === id);
      const fresh = emptyBlock();
      focusBlock(fresh.id, 0);
      return [
        ...current.slice(0, index + 1),
        fresh,
        ...current.slice(index + 1),
      ];
    });

  /** One pass for the whole list, not one scan per row. */
  const numbers = numberedPositions(blocks);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((current) => {
      const from = current.findIndex((b) => b.id === active.id);
      const to = current.findIndex((b) => b.id === over.id);
      return from === -1 || to === -1 ? current : arrayMove(current, from, to);
    });
  };

  return (
    <div className="note-editor">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={blocks.map((b) => b.id)}>
          {blocks.map((block, index) => (
            <BlockRow
              key={block.id}
              block={block}
              /* The SAME function the serialiser uses, so what you see
                 is literally what is stored. */
              number={numbers[index]}
              placeholder={index === 0 ? placeholder : undefined}
              menuOpen={menuFor === block.id}
              onOpenMenu={(open) => setMenuFor(open ? block.id : null)}
              registerInput={(node) => {
                if (node) inputs.current.set(block.id, node);
                else inputs.current.delete(block.id);
              }}
              onText={(text) => {
                const shortcut = shortcutFor(text);
                if (shortcut) convert(block.id, shortcut.kind, shortcut.rest);
                else patch(block.id, { text });
              }}
              onToggle={() => patch(block.id, { checked: !block.checked })}
              onEnter={(caret) => splitAt(block.id, caret)}
              onBackspaceAtStart={() => backspaceAtStart(block.id)}
              onConvert={(kind) => convert(block.id, kind)}
              onRemove={() => removeBlock(block.id)}
              onAddAfter={() => addBlockAfter(block.id)}
              onBlur={() => void flushNow()}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

/** Position within the current run of numbered blocks (1-based). */
function BlockRow({
  block,
  number,
  placeholder,
  menuOpen,
  onOpenMenu,
  registerInput,
  onText,
  onToggle,
  onEnter,
  onBackspaceAtStart,
  onConvert,
  onRemove,
  onAddAfter,
  onBlur,
}: {
  block: NoteBlock;
  number: number;
  placeholder?: string;
  menuOpen: boolean;
  onOpenMenu: (open: boolean) => void;
  registerInput: (node: HTMLTextAreaElement | null) => void;
  onText: (text: string) => void;
  onToggle: () => void;
  onEnter: (caret: number) => void;
  onBackspaceAtStart: () => void;
  onConvert: (kind: BlockKind) => void;
  onRemove: () => void;
  onAddAfter: () => void;
  /** Save what is held: attention has left this block. */
  onBlur: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow: a note block is as tall as its text, never a scrollbox.
  const grow = React.useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, []);
  React.useLayoutEffect(grow, [block.text, block.kind, grow]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "note-block group relative flex items-start gap-1 rounded-md py-0.5",
        isDragging && "z-10 bg-surface opacity-80 shadow-card",
      )}
      data-kind={block.kind}
    >
      {/* The handles sit in a gutter that only appears on hover, so the
          page reads as a document rather than a form full of controls. */}
      <div className="flex w-12 shrink-0 items-center justify-end gap-0.5 pt-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
        <button
          type="button"
          aria-label="Add block below"
          onClick={onAddAfter}
          className="flex size-6 items-center justify-center rounded text-fg-tertiary hover:bg-surface-hover hover:text-fg"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder block ${number || ""}`.trim()}
          title="Drag to reorder"
          className="flex size-6 cursor-grab touch-none items-center justify-center rounded text-fg-tertiary hover:bg-surface-hover hover:text-fg active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
      </div>

      <div className="min-w-0 flex-1 pr-8">
        {block.kind === "divider" ? (
          <hr className="my-3 border-border" />
        ) : (
          <div className="flex items-start gap-2">
            <BlockMarker block={block} number={number} onToggle={onToggle} />
            <textarea
              ref={(node) => {
                ref.current = node;
                registerInput(node);
              }}
              rows={1}
              value={block.text}
              placeholder={placeholder}
              aria-label={`${block.kind} block`}
              onChange={(e) => onText(e.target.value)}
              onBlur={onBlur}
              onKeyDown={(e) => {
                // isComposing: an IME is converting, and this Enter is
                // committing a candidate — never a block split.
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onEnter(e.currentTarget.selectionStart);
                  return;
                }
                if (
                  e.key === "Backspace" &&
                  e.currentTarget.selectionStart === 0 &&
                  e.currentTarget.selectionEnd === 0
                ) {
                  e.preventDefault();
                  onBackspaceAtStart();
                  return;
                }
                // `/` on an empty block opens the type menu — the one
                // gesture people bring with them from every other editor.
                if (e.key === "/" && block.text === "") onOpenMenu(true);
                if (e.key === "Escape") onOpenMenu(false);
              }}
              className={cn(
                "w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-fg-tertiary focus:ring-0",
                BLOCK_TEXT[block.kind],
                block.kind === "todo" &&
                  block.checked &&
                  "text-fg-tertiary line-through",
              )}
            />
          </div>
        )}

        {menuOpen && (
          <BlockMenu
            onPick={(kind) => onConvert(kind)}
            onClose={() => onOpenMenu(false)}
          />
        )}
      </div>

      <button
        type="button"
        aria-label="Delete block"
        onClick={onRemove}
        className="absolute top-1 right-0 flex size-6 items-center justify-center rounded text-fg-tertiary opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-surface-hover hover:text-danger max-lg:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

/** The bullet, number or checkbox that sits before a block's text. */
function BlockMarker({
  block,
  number,
  onToggle,
}: {
  block: NoteBlock;
  number: number;
  onToggle: () => void;
}) {
  switch (block.kind) {
    case "bullet":
      return (
        <span aria-hidden className="pt-[0.45rem] text-fg-tertiary">
          <span className="block size-1.5 rounded-full bg-current" />
        </span>
      );
    case "numbered":
      return (
        <span
          aria-hidden
          className="w-4 shrink-0 pt-px text-[0.9375rem] tabular-nums text-fg-tertiary"
        >
          {number}.
        </span>
      );
    case "todo":
      return (
        <button
          type="button"
          role="checkbox"
          aria-checked={block.checked ?? false}
          aria-label={block.text || "To-do"}
          onClick={onToggle}
          className={cn(
            "mt-1 flex size-4 shrink-0 items-center justify-center rounded border",
            block.checked
              ? "border-accent bg-accent text-white"
              : "border-border-strong text-transparent hover:border-fg-tertiary",
          )}
        >
          <Check className="size-3" />
        </button>
      );
    case "quote":
      return (
        <span
          aria-hidden
          className="mt-1 w-0.5 shrink-0 self-stretch rounded bg-border-strong"
        />
      );
    default:
      return null;
  }
}

function BlockMenu({
  onPick,
  onClose,
}: {
  onPick: (kind: BlockKind) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Click-away, not a blur handler: blur fires when the pointer
          goes down on a menu item too, which would close the menu
          before the click landed. */}
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <ul className="block-menu absolute z-20 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl">
        {BLOCK_MENU.map((item) => (
          <li key={item.kind}>
            <button
              type="button"
              onClick={() => onPick(item.kind)}
              className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-surface-hover"
            >
              <span className="text-[0.9375rem]">{item.label}</span>
              <span className="text-[0.75rem] text-fg-tertiary">
                {item.hint}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
