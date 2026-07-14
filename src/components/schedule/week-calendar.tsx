"use client";

import * as React from "react";
import Link from "next/link";
import { addDays, format, isSameDay } from "date-fns";
import { NewLessonDialog } from "@/components/lessons/new-lesson-dialog";
import { Card } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { toLocalDatetimeValue } from "@/lib/datetime";

export type CalendarLesson = {
  id: string;
  title: string | null;
  studentName: string;
  /** ISO string — serialized across the RSC boundary. */
  startedAt: string;
  durationMinutes: number | null;
  status: string;
};

const FIRST_HOUR = 7;
const LAST_HOUR = 21; // exclusive

/** Clamp a lesson into the visible hour band so nothing silently vanishes. */
function rowHour(d: Date): number {
  return Math.min(Math.max(d.getHours(), FIRST_HOUR), LAST_HOUR - 1);
}

/**
 * Thin week calendar. Click an empty slot to book a lesson at that time
 * (teacher only); lesson chips link into the agenda's context panel.
 * `today` arrives from the server so render stays pure.
 */
export function WeekCalendar({
  lessons,
  students,
  weekStartIso,
  todayIso,
  readOnly = false,
  createdId,
}: {
  lessons: CalendarLesson[];
  students?: { id: string; name: string }[];
  weekStartIso: string;
  todayIso: string;
  readOnly?: boolean;
  /** Freshly created booking — its chip plays a one-time pop. */
  createdId?: string;
}) {
  const [slot, setSlot] = React.useState<string | null>(null);

  const weekStart = new Date(weekStartIso);
  const today = new Date(todayIso);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from(
    { length: LAST_HOUR - FIRST_HOUR },
    (_, i) => FIRST_HOUR + i,
  );

  const byCell = new Map<string, CalendarLesson[]>();
  for (const lesson of lessons) {
    const at = new Date(lesson.startedAt);
    const key = `${format(at, "yyyy-MM-dd")}-${rowHour(at)}`;
    const cell = byCell.get(key);
    if (cell) cell.push(lesson);
    else byCell.set(key, [lesson]);
  }

  return (
    <Card className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-border">
          <div />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "px-2 py-2 text-center text-[0.8125rem] font-medium",
                isSameDay(day, today)
                  ? "text-accent-text"
                  : "text-fg-secondary",
              )}
            >
              {format(day, "EEE d")}
            </div>
          ))}
        </div>

        {hours.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-border last:border-0"
          >
            <div className="px-2 py-1 text-right text-[0.7rem] text-fg-tertiary">
              {String(hour).padStart(2, "0")}:00
            </div>
            {days.map((day) => {
              const key = `${format(day, "yyyy-MM-dd")}-${hour}`;
              const cellLessons = byCell.get(key) ?? [];
              const slotDate = new Date(day);
              slotDate.setHours(hour, 0, 0, 0);

              const chips = cellLessons.map((lesson) => {
                const chip = (
                  <span
                    className={cn(
                      "block truncate rounded px-1.5 py-0.5 text-left text-[0.7rem] font-medium",
                      lesson.status === "scheduled"
                        ? "bg-accent-soft text-accent-text"
                        : "bg-surface-hover text-fg-secondary",
                      lesson.id === createdId && "chip-created",
                    )}
                    title={`${format(new Date(lesson.startedAt), "HH:mm")} · ${lesson.studentName}${lesson.title ? ` · ${lesson.title}` : ""}`}
                  >
                    {format(new Date(lesson.startedAt), "HH:mm")}{" "}
                    {lesson.studentName}
                  </span>
                );
                return readOnly ? (
                  <React.Fragment key={lesson.id}>{chip}</React.Fragment>
                ) : (
                  <Link
                    key={lesson.id}
                    href={`/schedule?lesson=${lesson.id}`}
                    className="block"
                  >
                    {chip}
                  </Link>
                );
              });

              // Chips and the book-this-slot button are SIBLINGS — never
              // nested interactives (a chip click must not also arm the
              // slot, and vice versa). The button fills the empty space.
              return (
                <div
                  key={key}
                  className={cn(
                    "flex min-h-11 flex-col border-l border-border p-0.5",
                    isSameDay(day, today) && "bg-accent-soft/30",
                  )}
                >
                  {chips.length > 0 && <div className="space-y-0.5">{chips}</div>}
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Schedule ${format(day, "EEE MMM d")} at ${String(hour).padStart(2, "0")}:00`}
                      onClick={() => setSlot(toLocalDatetimeValue(slotDate))}
                      className="min-h-4 w-full flex-1 cursor-pointer rounded transition-colors hover:bg-surface-hover/60"
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {!readOnly && (
        <NewLessonDialog
          students={students ?? []}
          open={slot !== null}
          onOpenChange={(next) => {
            if (!next) setSlot(null);
          }}
          initialStart={slot ?? undefined}
          stay="calendar"
        />
      )}
    </Card>
  );
}
