import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, students, teachers } from "@/db";
import { PortalContent } from "@/components/portal/portal-content";

export const metadata: Metadata = { title: "Your classroom" };

/**
 * Persistent student portal. The token in the URL is the sole
 * authorization (revocable — the teacher can rotate or disable it).
 */
export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const row = await db
    .select({ student: students, teacherName: teachers.name })
    .from(students)
    .innerJoin(teachers, eq(teachers.id, students.teacherId))
    .where(eq(students.portalToken, token))
    .limit(1);

  const found = row[0];
  if (!found) notFound();

  return (
    <div className="px-6 py-10">
      <PortalContent
        student={found.student}
        teacherName={found.teacherName}
        token={token}
      />
    </div>
  );
}
