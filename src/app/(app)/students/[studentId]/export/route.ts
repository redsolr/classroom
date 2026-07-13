import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { getStudentProfile } from "@/lib/queries";

/**
 * Full student-record export (teacher-authenticated). Durability is a
 * product rule: the record is portable by design — we win by being
 * useful, not by holding history hostage.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const { studentId } = await params;
  const teacher = await requireTeacher();
  const profile = await getStudentProfile(teacher.id, studentId);
  if (!profile) return new NextResponse("Not found", { status: 404 });

  const payload = {
    format: "classroom.student-record",
    version: 1,
    exportedAt: new Date().toISOString(),
    ...profile,
  };

  const slug =
    profile.student.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "student";

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="classroom-${slug}.json"`,
    },
  });
}
