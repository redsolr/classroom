import { requireTeacher } from "@/lib/auth";
import { getSidebarStudy } from "@/lib/study-sidebar";
import { unreadCountFor } from "@/lib/message-queries";
import { Sidebar } from "@/components/shell/sidebar";
import { PageShell } from "@/components/ui/page-header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const teacher = await requireTeacher();
  const [study, unreadMessages] = await Promise.all([
    getSidebarStudy(),
    // The teacher row carries the identity the inbox is keyed on, so no
    // second resolver is needed here.
    unreadCountFor({
      workosUserId: teacher.workosUserId,
      email: teacher.email,
    }),
  ]);

  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar
        teacherName={teacher.name ?? "Teacher"}
        teacherEmail={teacher.email}
        study={study}
        unreadMessages={unreadMessages}
      />
      <main className="min-w-0 flex-1">
        <PageShell>{children}</PageShell>
      </main>
    </div>
  );
}
