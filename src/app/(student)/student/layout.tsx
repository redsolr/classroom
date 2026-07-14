import { requireStudent } from "@/lib/auth";
import { StudentSidebar } from "@/components/shell/student-sidebar";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const student = await requireStudent();

  return (
    <div className="flex min-h-screen">
      <StudentSidebar
        studentName={student.name}
        studentEmail={student.email}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-10 py-10">{children}</div>
      </main>
    </div>
  );
}
