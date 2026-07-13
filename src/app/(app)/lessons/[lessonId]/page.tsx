import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { getLessonWithRecords } from "@/lib/queries";
import { aiModeLabel } from "@/lib/ai/extract";
import { LessonEditor } from "@/components/lessons/lesson-editor";
import { LessonHeader } from "@/components/lessons/lesson-header";

export const metadata: Metadata = { title: "Lesson" };

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const teacher = await requireTeacher();
  const detail = await getLessonWithRecords(teacher.id, lessonId);
  if (!detail) notFound();

  return (
    <div>
      <LessonHeader detail={detail} />
      <LessonEditor detail={detail} aiMode={aiModeLabel()} />
    </div>
  );
}
