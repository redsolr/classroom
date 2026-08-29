import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireTeacher } from "@/lib/auth";
import { listStudents } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { StudentsTable } from "@/components/students/students-table";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage() {
  const teacher = await requireTeacher();
  const students = await listStudents(teacher.id);

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Students"
        subtitle={`${students.length} learner${students.length === 1 ? "" : "s"} in your classroom`}
      />
      <StudentsTable students={students} />
    </div>
  );
}
