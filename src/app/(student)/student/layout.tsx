import { requireStudent } from "@/lib/auth";
import { getSidebarStudy } from "@/lib/study-sidebar";
import { StudentSidebar } from "@/components/shell/student-sidebar";
import { PageShell } from "@/components/ui/page-header";

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
        <PageShell>{children}</PageShell>
      </main>
    </div>
  );
}
