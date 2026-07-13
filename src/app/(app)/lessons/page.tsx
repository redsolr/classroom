import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { BookOpenText } from "lucide-react";
import { requireTeacher } from "@/lib/auth";
import { listLessons, listStudents } from "@/lib/queries";
import { Avatar } from "@/components/ui/avatar";
import { Badge, lessonStatusTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, PageHeader } from "@/components/ui/page-header";
import { NewLessonDialog } from "@/components/lessons/new-lesson-dialog";

export const metadata: Metadata = { title: "Lessons" };

export default async function LessonsPage() {
  const teacher = await requireTeacher();
  const [lessons, students] = await Promise.all([
    listLessons(teacher.id),
    listStudents(teacher.id),
  ]);

  const studentOptions = students.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div>
      <PageHeader
        title="Lessons"
        subtitle={`${lessons.length} lesson${lessons.length === 1 ? "" : "s"} recorded`}
        actions={<NewLessonDialog students={studentOptions} />}
      />

      {lessons.length === 0 ? (
        <EmptyState
          icon={<BookOpenText />}
          title="No lessons yet"
          description={
            students.length === 0
              ? "Add a student first, then create your first lesson."
              : "Create a lesson, paste your notes, and let Class-room structure them."
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {lessons.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/lessons/${l.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <Avatar name={l.studentName} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.88rem] font-medium">
                      {l.title ?? `Lesson with ${l.studentName}`}
                    </span>
                    <span className="block text-[0.75rem] text-fg-tertiary">
                      {l.studentName} ·{" "}
                      {format(new Date(l.startedAt), "EEE, MMM d yyyy · HH:mm")}
                      {l.durationMinutes ? ` · ${l.durationMinutes} min` : ""}
                    </span>
                  </span>
                  <Badge tone={lessonStatusTone[l.status]}>{l.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
