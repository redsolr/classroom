import { requireLearner, resolveAccount } from "@/lib/auth";
import { STUDY_MODEL, STUDY_MODEL_ROSTER } from "@/lib/ai/study-tutor";
import { getSidebarStudy } from "@/lib/study-sidebar";
import { AskDock } from "@/components/study/ask-dock";
import { MobileTabbar } from "@/components/shell/mobile-tabbar";
import { Sidebar } from "@/components/shell/sidebar";
import { StudentSidebar } from "@/components/shell/student-sidebar";

/**
 * The study area lives inside the SAME sidebar shell as the rest of the
 * app — SELF-STUDY is just another section, not a separate product with
 * its own chrome. The signed-in account's role picks which sidebar
 * renders; requireLearner guarantees the learner row exists (and bounces
 * anonymous callers to /login).
 */
export default async function StudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guard only — anonymous callers bounce to /login before any chrome.
  await requireLearner();
  const account = await resolveAccount();
  const study = await getSidebarStudy();

  return (
    <div className="min-h-dvh lg:flex">
      {account?.kind === "student" ? (
        <StudentSidebar
          studentName={account.student.name}
          studentEmail={account.student.email}
          study={study}
        />
      ) : (
        <Sidebar
          teacherName={
            (account?.kind === "teacher" ? account.teacher.name : null) ??
            "Teacher"
          }
          teacherEmail={
            account?.kind === "teacher" ? account.teacher.email : ""
          }
          study={study}
        />
      )}
      {/* Padded so the fixed phone tab bar never covers the last row of
          a page; the var is 0 at lg, where there is no bar. */}
      <main className="min-w-0 flex-1 pb-[var(--study-tabbar-h)]">
        {children}
      </main>
      {/* The CRM-style Ask drawer — available on every study page. */}
      <AskDock models={STUDY_MODEL_ROSTER} defaultModel={STUDY_MODEL} />
      {/* Phone-only quick access: chat, books, decks, official. */}
      <MobileTabbar />
    </div>
  );
}
