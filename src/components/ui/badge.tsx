import * as React from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-hover text-fg-secondary border-border",
  accent: "bg-accent-soft text-accent-text border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-px text-[0.72rem] font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// Domain-tone mappings kept in one place so status colors stay consistent.

export const studentStatusTone: Record<string, Tone> = {
  active: "success",
  trial: "info",
  paused: "warning",
  inactive: "neutral",
};

export const lessonStatusTone: Record<string, Tone> = {
  draft: "neutral",
  processed: "info",
  reviewed: "accent",
  shared: "success",
};

export const homeworkStatusTone: Record<string, Tone> = {
  assigned: "info",
  submitted: "warning",
  reviewed: "accent",
  completed: "success",
  skipped: "neutral",
};

export const vocabularyStatusTone: Record<string, Tone> = {
  new: "info",
  learning: "warning",
  reviewing: "accent",
  mastered: "success",
};

export const insightTypeLabel: Record<string, string> = {
  recurringMistake: "Recurring mistake",
  learningPreference: "Learning preference",
  interest: "Interest",
  strength: "Strength",
  weakness: "Weakness",
  teachingStrategy: "Teaching strategy",
  generalObservation: "Observation",
};

export const insightTypeTone: Record<string, Tone> = {
  recurringMistake: "danger",
  learningPreference: "info",
  interest: "accent",
  strength: "success",
  weakness: "warning",
  teachingStrategy: "info",
  generalObservation: "neutral",
};

export const correctionCategoryLabel: Record<string, string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  pronunciation: "Pronunciation",
  wordChoice: "Word choice",
  naturalExpression: "Natural expression",
  spelling: "Spelling",
  other: "Other",
};
