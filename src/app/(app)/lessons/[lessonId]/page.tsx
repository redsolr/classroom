import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarX2 } from "lucide-react";
import { requireTeacher } from "@/lib/auth";
import { getLessonWithRecords, type LessonDetail } from "@/lib/queries";
import { aiModeLabel } from "@/lib/ai/extract";
import { attendanceOutcomeLabel } from "@/components/ui/badge";
import { Card } from "@/components/ui/page-header";
import { LessonEditor } from "@/components/lessons/lesson-editor";
import { LessonHeader } from "@/components/lessons/lesson-header";
import { ScheduledLessonPanel } from "@/components/lessons/scheduled-lesson-panel";

export const metadata: Metadata = { title: "Lesson" };

function CancelledLessonNotice({ detail }: { detail: LessonDetail }) {
  const outcome = detail.lesson.attendanceOutcome;
  return (
    <Card>
      <div className="flex items-start gap-3 px-4 py-4">
        <CalendarX2 className="mt-0.5 size-4.5 shrink-0 text-fg-tertiary" />
        <div>
          <p className="text-[0.9375rem] font-medium">
            This lesson was cancelled
            {outcome ? ` — ${attendanceOutcomeLabel[outcome].toLowerCase()}` : ""}
            .
          </p>
          <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
            It stays in {detail.student.name}&rsquo;s history but doesn&rsquo;t
            count as a taught lesson.
          </p>
        </div>
      </div>
    </Card>
  );
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const teacher = await requireTeacher();
  const detail = await getLessonWithRecords(teacher.id, lessonId);
  if (!detail) notFound();

  const { status } = detail.lesson;

  return (
    <div>
      <LessonHeader detail={detail} />
      {status === "scheduled" ? (
        <ScheduledLessonPanel detail={detail} />
      ) : status === "cancelled" ? (
        <CancelledLessonNotice detail={detail} />
      ) : (
        <LessonEditor detail={detail} aiMode={aiModeLabel()} />
      )}
    </div>
  );
}
