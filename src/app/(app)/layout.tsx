import { requireTeacher } from "@/lib/auth";
import { Sidebar } from "@/components/shell/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const teacher = await requireTeacher();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        teacherName={teacher.name ?? "Teacher"}
        teacherEmail={teacher.email}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-10 py-10">{children}</div>
      </main>
    </div>
  );
}
