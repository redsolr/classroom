import {
  BookOpen,
  GraduationCap,
  Languages,
  MessageCircle,
  MessagesSquare,
  MessageSquareQuote,
  Spline,
  type LucideIcon,
} from "lucide-react";
import type { BranchKey } from "@/lib/study-path-tree";
import type { PathStepProgress } from "@/lib/study-progress";

/** One icon per step kind and one per limb, in a module of their own so
 * the tree and the panel that opens off it never drift apart. */

export const STEP_ICON: Record<PathStepProgress["kind"], LucideIcon> = {
  pack: BookOpen,
  sentences: MessageSquareQuote,
  chat: MessageCircle,
  lesson: GraduationCap,
};

export const BRANCH_ICON: Record<BranchKey, LucideIcon> = {
  vocabulary: Languages,
  grammar: Spline,
  conversation: MessagesSquare,
};
