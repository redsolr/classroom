import { requireStudent } from "@/lib/auth";
import { getSidebarStudy } from "@/lib/study-sidebar";
import { StudentSidebar } from "@/components/shell/student-sidebar";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const student = await requireStudent();
  const study = await getSidebarStudy();

  return (
    <div className="min-h-dvh lg:flex">
      <StudentSidebar
        studentName={student.name}
        studentEmail={student.email}
        study={study}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
