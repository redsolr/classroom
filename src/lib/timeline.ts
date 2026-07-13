import { format } from "date-fns";
import type { StudentProfile } from "@/lib/queries";
import {
  goalStatusTone,
  homeworkStatusTone,
  insightTypeLabel,
  insightTypeTone,
  lessonStatusTone,
  type Tone,
} from "@/components/ui/badge";

export type TimelineKind =
  | "lesson"
  | "recap"
  | "corrections"
  | "vocabulary"
  | "homework"
  | "goal"
  | "insight";

export type TimelineEvent = {
  key: string;
  at: Date;
  kind: TimelineKind;
  title: string;
  detail?: string;
  href?: string;
  badge?: { label: string; tone: Tone };
};

export type TimelineDay = {
  key: string;
  label: string;
  events: TimelineEvent[];
};

function dayKey(at: Date): string {
  return format(at, "yyyy-MM-dd");
}

/** Group same-lesson (or same-day, when unlinked) record items into one event. */
function groupRecords<T extends { createdAt: Date; lessonId: string | null }>(
  items: T[],
): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.lessonId ?? `day:${dayKey(item.createdAt)}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

function truncateList(parts: string[], max: number): string {
  if (parts.length <= max) return parts.join(" · ");
  return `${parts.slice(0, max).join(" · ")} · +${parts.length - max} more`;
}

/** Flatten the full student record into one chronological stream, newest first. */
export function buildStudentTimeline(profile: StudentProfile): TimelineDay[] {
  const events: TimelineEvent[] = [];

  for (const lesson of profile.lessons) {
    events.push({
      key: `lesson-${lesson.id}`,
      at: lesson.startedAt,
      kind: "lesson",
      title: lesson.title ?? "Lesson",
      detail: lesson.summary ?? undefined,
      href: `/lessons/${lesson.id}`,
      badge: { label: lesson.status, tone: lessonStatusTone[lesson.status] },
    });
    if (lesson.recapSharedAt) {
      events.push({
        key: `recap-${lesson.id}`,
        at: lesson.recapSharedAt,
        kind: "recap",
        title: "Recap shared",
        detail: lesson.title ?? undefined,
        href: `/lessons/${lesson.id}`,
      });
    }
  }

  for (const group of groupRecords(profile.corrections)) {
    const n = group.length;
    events.push({
      key: `corrections-${group[0].id}`,
      at: group[0].createdAt,
      kind: "corrections",
      title: `${n} correction${n === 1 ? "" : "s"} added`,
      detail: truncateList(
        group.map((c) => `${c.originalText} → ${c.correctedText}`),
        3,
      ),
      href: group[0].lessonId ? `/lessons/${group[0].lessonId}` : undefined,
    });
  }

  for (const group of groupRecords(profile.vocabulary)) {
    const n = group.length;
    events.push({
      key: `vocabulary-${group[0].id}`,
      at: group[0].createdAt,
      kind: "vocabulary",
      title: `${n} vocabulary item${n === 1 ? "" : "s"} added`,
      detail: truncateList(
        group.map((v) => v.term),
        6,
      ),
      href: group[0].lessonId ? `/lessons/${group[0].lessonId}` : undefined,
    });
  }

  for (const hw of profile.homework) {
    events.push({
      key: `homework-${hw.id}`,
      at: hw.createdAt,
      kind: "homework",
      title: "Homework assigned",
      detail: hw.title,
      href: hw.lessonId ? `/lessons/${hw.lessonId}` : undefined,
      badge: { label: hw.status, tone: homeworkStatusTone[hw.status] },
    });
  }

  for (const goal of profile.goals) {
    events.push({
      key: `goal-${goal.id}`,
      at: goal.createdAt,
      kind: "goal",
      title: "Goal set",
      detail: goal.title,
      badge: { label: goal.status, tone: goalStatusTone[goal.status] },
    });
    if (goal.status === "completed") {
      events.push({
        key: `goal-done-${goal.id}`,
        at: goal.updatedAt,
        kind: "goal",
        title: "Goal completed",
        detail: goal.title,
        badge: { label: "completed", tone: "success" },
      });
    }
  }

  for (const insight of profile.insights) {
    events.push({
      key: `insight-${insight.id}`,
      at: insight.createdAt,
      kind: "insight",
      title: insight.title,
      detail: insight.description ?? undefined,
      badge: {
        label: insightTypeLabel[insight.type],
        tone: insightTypeTone[insight.type],
      },
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());

  const days: TimelineDay[] = [];
  for (const event of events) {
    const key = dayKey(event.at);
    const day = days[days.length - 1];
    if (day && day.key === key) day.events.push(event);
    else
      days.push({
        key,
        label: format(event.at, "EEE, MMM d yyyy"),
        events: [event],
      });
  }
  return days;
}
