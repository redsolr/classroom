import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, notInArray } from "drizzle-orm";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowRight, CalendarClock } from "lucide-react";
import { db, lessons } from "@/db";
import { requireStudent } from "@/lib/auth";
import { Badge, lessonStatusTone } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "My schedule" };

export default async function StudentSchedulePage() {
  const student = await requireStudent();

  const [upcoming, past] = await Promise.all([
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
          notInArray(lessons.status, ["scheduled", "cancelled"]),
        ),
      )
      .orderBy(desc(lessons.startedAt))
      .limit(20),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="My schedule"
        subtitle={
          upcoming.length === 0
            ? "No upcoming lessons booked yet — your teacher schedules them."
            : `${upcoming.length} upcoming lesson${upcoming.length === 1 ? "" : "s"}`
        }
      />

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
