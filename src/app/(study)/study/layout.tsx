import { requireLearner } from "@/lib/auth";
import { StudyNav } from "@/components/study/study-nav";

export default async function StudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLearner();

  return (
    <div className="flex min-h-dvh flex-col">
      <StudyNav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
