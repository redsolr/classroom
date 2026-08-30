import type { BlockKind } from "@/lib/notes/blocks";

/**
 * The TYPE SCALE a block is drawn at — one definition, two renderers.
 *
 * `note-editor.tsx` draws each block as a textarea; `note-blocks.tsx`
 * draws the same block as static markup. They are deliberately separate
 * components (one has an interactive checkbox, the other a disabled
 * indicator — merging them would need a variant prop whose only job is
 * to remove interactivity), but they must agree on SIZE.
 *
 * That agreement is the whole promise of a block editor: press Done and
 * nothing should move. Two literal copies of the scale is exactly how a
 * heading ends up one size while you type it and another once it is
 * saved — which reads as the app losing your formatting even though the
 * markdown is identical.
 *
 * Layout stays with each renderer. Only the scale is shared, because
 * only the scale has to match.
 */
export const BLOCK_TEXT: Record<BlockKind, string> = {
  paragraph: "text-[0.9375rem] leading-relaxed",
  heading: "text-[1.25rem] font-semibold leading-snug",
  subheading: "text-[1.0625rem] font-semibold leading-snug",
  bullet: "text-[0.9375rem] leading-relaxed",
  numbered: "text-[0.9375rem] leading-relaxed",
  todo: "text-[0.9375rem] leading-relaxed",
  quote: "text-[0.9375rem] leading-relaxed italic text-fg-secondary",
  code: "font-mono text-[0.875rem] leading-relaxed",
  divider: "",
};
