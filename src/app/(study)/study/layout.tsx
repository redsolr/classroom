import { requireLearner, resolveAccount } from "@/lib/auth";
import { STUDY_MODEL, STUDY_MODELS } from "@/lib/ai/study-tutor";
import { getSidebarStudy } from "@/lib/study-sidebar";
import { AskDock } from "@/components/study/ask-dock";
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
  const learner = await requireLearner();
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
      <main className="min-w-0 flex-1">{children}</main>
      {/* The CRM-style Ask drawer — available on every study page. */}
      <AskDock
        learnerName={learner.name}
        models={
          STUDY_MODELS.includes(STUDY_MODEL)
            ? STUDY_MODELS
            : [STUDY_MODEL, ...STUDY_MODELS]
        }
        defaultModel={STUDY_MODEL}
      />
    </div>
  );
}
