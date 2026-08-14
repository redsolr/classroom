import { requireTeacher } from "@/lib/auth";
import { getSidebarStudy } from "@/lib/study-sidebar";
import { Sidebar } from "@/components/shell/sidebar";
import { PageShell } from "@/components/ui/page-header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const teacher = await requireTeacher();
  const study = await getSidebarStudy();

  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar
        teacherName={teacher.name ?? "Teacher"}
        teacherEmail={teacher.email}
        study={study}
      />
      <main className="min-w-0 flex-1">
        <PageShell>{children}</PageShell>
      </main>
    </div>
  );
}
