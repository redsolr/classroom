import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, teachers } from "@/db";
import { requireStudent } from "@/lib/auth";
import { PortalContent } from "@/components/portal/portal-content";

export const metadata: Metadata = { title: "My class-room" };

export default async function StudentHomePage() {
  const student = await requireStudent();
  const teacher = await db.query.teachers.findFirst({
    where: eq(teachers.id, student.teacherId),
    columns: { name: true },
  });

  return (
    <PortalContent
      student={student}
      teacherName={teacher?.name ?? null}
      // requireStudent guarantees a portal token on claimed accounts.
      token={student.portalToken!}
    />
  );
}
