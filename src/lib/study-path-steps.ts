import type { PathStepProgress } from "@/lib/study-progress";

/**
 * What one step IS, in words and links — shared by the tree's nodes and
 * the panel that opens off them so a node and its own detail can never
 * disagree about where it goes or what it counts.
 */

type Kind = PathStepProgress["kind"];

/**
 * Where a step sends you: the surface it is about, already scoped. A
 * step that lands you on a page you then have to navigate out of is a
 * description of work, not a way into it.
 */
export function stepHref(step: {
  kind: Kind;
  packSlug: string | null;
}): string {
  switch (step.kind) {
    case "pack":
      return step.packSlug ? `/official/${step.packSlug}` : "/official";
    case "sentences":
      return "/sentences";
    case "chat":
      return "/chat";
    case "lesson":
      return "/tutors";
  }
}

/** The step's own unit — never a bare percentage. "60% of a thing you
 * cannot name" is not something anyone can act on. */
export function stepUnit(kind: Kind): string {
  switch (kind) {
    case "pack":
      return "words known";
    case "sentences":
      return "cards known";
    case "chat":
      return "messages";
    case "lesson":
      return "lessons";
  }
}

/** The kind as a chip: what sort of work this is. */
export function stepKindLabel(kind: Kind): string {
  switch (kind) {
    case "pack":
      return "Word book";
    case "sentences":
      return "Sentence cards";
    case "chat":
      return "Tutor chat";
    case "lesson":
      return "Lesson with a person";
  }
}

/** The panel's one button. It names the destination rather than saying
 * "Start" — you are never starting, you are opening a surface that has
 * been there the whole time. */
export function stepCta(kind: Kind): string {
  switch (kind) {
    case "pack":
      return "Open the book";
    case "sentences":
      return "Make and drill cards";
    case "chat":
      return "Open the tutor";
    case "lesson":
      return "Find a tutor";
  }
}
