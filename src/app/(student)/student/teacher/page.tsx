import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { Languages, Mail } from "lucide-react";
import { db, teachers } from "@/db";
import { requireStudent } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { Card, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "My teacher" };

export default async function StudentTeacherPage() {
  const student = await requireStudent();
  const teacher = await db.query.teachers.findFirst({
    where: eq(teachers.id, student.teacherId),
  });

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="My teacher" />

      <Card>
        <div className="flex items-start gap-4 px-5 py-5">
          <Avatar name={teacher?.name ?? "Teacher"} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[1.125rem] font-semibold tracking-tight">
              {teacher?.name ?? "Your teacher"}
            </p>
            <div className="mt-2 space-y-1.5 text-[0.9375rem] text-fg-secondary">
              {teacher?.email && (
                <p className="flex items-center gap-2">
                  <Mail className="size-4 text-fg-tertiary" />
                  <a
                    href={`mailto:${teacher.email}`}
                    className="hover:underline"
                  >
                    {teacher.email}
                  </a>
                </p>
              )}
              {teacher?.languagesTaught && teacher.languagesTaught.length > 0 && (
                <p className="flex items-center gap-2">
                  <Languages className="size-4 text-fg-tertiary" />
                  Teaches {teacher.languagesTaught.join(", ")}
                </p>
              )}
            </div>
            <p className="mt-3 text-[0.875rem] text-fg-tertiary">
              Lessons are booked with your teacher directly — new sessions
              appear in your schedule as soon as they&rsquo;re planned.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
