import type { Metadata } from "next";
import Link from "next/link";
import { callPath } from "@/lib/call-path";
import { and, asc, desc, eq, gte, lt, notInArray } from "drizzle-orm";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowRight, CalendarClock } from "lucide-react";
import { db, lessons } from "@/db";
import { requireStudent } from "@/lib/auth";
import { nowIso, resolveWeekStart } from "@/lib/week";
import { NOT_HAPPENED_STATUSES } from "@/lib/lesson-status";
import { Badge, lessonStatusTone } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WeekCalendar } from "@/components/schedule/week-calendar";
import { WeekNav } from "@/components/schedule/week-nav";

export const metadata: Metadata = { title: "My schedule" };

export default async function StudentSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const student = await requireStudent();
  const weekStart = resolveWeekStart(week);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [upcoming, past, weekLessons] = await Promise.all([
    db
      .select()
      .from(lessons)
      .where(
        and(eq(lessons.studentId, student.id), eq(lessons.status, "scheduled")),
      )
      .orderBy(asc(lessons.startedAt)),
    db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.studentId, student.id),
          notInArray(lessons.status, [...NOT_HAPPENED_STATUSES]),
        ),
      )
      .orderBy(desc(lessons.startedAt))
      .limit(20),
    db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.studentId, student.id),
          gte(lessons.startedAt, weekStart),
          lt(lessons.startedAt, weekEnd),
          notInArray(lessons.status, ["cancelled"]),
        ),
      )
      .orderBy(asc(lessons.startedAt)),
  ]);

  return (
    <div className="max-w-4xl">
      <PageHeader
        icon={CalendarClock}
        title="My schedule"
        subtitle={
          upcoming.length === 0
            ? "No upcoming lessons booked yet — your teacher schedules them."
            : `${upcoming.length} upcoming lesson${upcoming.length === 1 ? "" : "s"}`
        }
      />

      <div className="mb-6">
        <WeekNav baseHref="/student/schedule" weekStart={weekStart} />
        <WeekCalendar
          lessons={weekLessons.map((l) => ({
            id: l.id,
            title: l.title,
            studentName: l.title ?? "Lesson",
            startedAt: l.startedAt.toISOString(),
            durationMinutes: l.durationMinutes,
            status: l.status,
          }))}
          weekStartIso={weekStart.toISOString()}
          todayIso={nowIso()}
          readOnly
        />
      </div>

      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="No lessons yet"
          description="When your teacher schedules a lesson with you, it appears here."
        />
      ) : (
        <div className="space-y-5">
          {upcoming.length > 0 && (
            <Card>
              <CardHeader title="Coming up" />
              <ul className="divide-y divide-border px-4">
                {upcoming.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium">
                        {l.title ?? "Lesson"}
                      </span>
                      <span className="block text-[0.8125rem] text-fg-tertiary">
                        {format(new Date(l.startedAt), "EEEE, MMM d · HH:mm")}
                        {l.durationMinutes ? ` · ${l.durationMinutes} min` : ""}
                        {` · ${formatDistanceToNow(new Date(l.startedAt), { addSuffix: true })}`}
                      </span>
                    </span>
                    {/* The student's only way into the room. Without it
                        the call is a feature only the teacher can reach,
                        and the other half of the lesson is left pasting
                        a URL someone sent them. */}
                    <Link
                      href={callPath(l.id)}
                      className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[0.8125rem] font-medium text-white hover:bg-accent-hover"
                    >
                      Join call
                    </Link>
                    <Badge tone={lessonStatusTone[l.status]}>{l.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {past.length > 0 && (
            <Card>
              <CardHeader title="Past lessons" />
              <ul className="divide-y divide-border px-4">
                {past.map((l) => {
                  const row = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium">
                          {l.title ?? "Lesson"}
                        </span>
                        <span className="block text-[0.8125rem] text-fg-tertiary">
                          {format(new Date(l.startedAt), "EEE, MMM d yyyy")}
                          {l.recapSharedAt ? " · recap available" : ""}
                        </span>
                      </span>
                      {l.recapSharedAt && l.recapToken ? (
                        <ArrowRight className="size-3.5 shrink-0 text-fg-tertiary" />
                      ) : (
                        <Badge tone={lessonStatusTone[l.status]}>
                          {l.status}
                        </Badge>
                      )}
                    </>
                  );
                  return (
                    <li key={l.id}>
                      {l.recapSharedAt && l.recapToken ? (
                        <Link
                          href={`/r/${l.recapToken}`}
                          className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
                        >
                          {row}
                        </Link>
                      ) : (
                        <span className="flex items-center gap-3 py-2.5">
                          {row}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
