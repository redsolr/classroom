import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowRight, BookOpenText, Compass } from "lucide-react";
import { requireTeacher } from "@/lib/auth";
import { getStudentProfile, type StudentProfile } from "@/lib/queries";
import { Badge, lessonStatusTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { NewLessonDialog } from "@/components/lessons/new-lesson-dialog";
import { NotesSection } from "@/components/students/notes-section";
import {
  GoalsSection,
  InsightsSection,
} from "@/components/students/profile-sections";
import { StudentHeader } from "@/components/students/student-header";
import { ProgressSection } from "@/components/students/progress-section";
import { TimelineSection } from "@/components/students/timeline-section";
import {
  CorrectionsSection,
  HomeworkSection,
  VocabularySection,
} from "@/components/records/record-sections";

export const metadata: Metadata = { title: "Student" };

function Overview({ profile }: { profile: StudentProfile }) {
  const { student, lessons, goals, vocabulary, homework, insights } = profile;

  const activeGoals = goals.filter((g) => g.status === "active");
  const openHomework = homework.filter((h) =>
    ["assigned", "submitted"].includes(h.status),
  );
  const recurring = insights.filter((i) => i.type === "recurringMistake");
  const latestLesson = lessons[0];
  const nextFocus = lessons.find((l) => l.nextLessonFocus)?.nextLessonFocus;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <Compass className="mt-0.5 size-4.5 shrink-0 text-accent" />
          <div>
            <p className="text-[0.875rem] font-semibold text-fg-secondary">
              Suggested focus for the next lesson
            </p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed">
              {nextFocus ??
                "No suggestion yet — process a lesson and one will appear here."}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={`Goals (${activeGoals.length} active)`} />
        <div className="px-4 py-3">
          {activeGoals.length === 0 ? (
            <p className="text-[0.875rem] text-fg-tertiary">No active goals.</p>
          ) : (
            <ul className="space-y-1.5">
              {activeGoals.slice(0, 4).map((g) => (
                <li key={g.id} className="text-[0.9375rem]">
                  {g.title}
                  <span className="ml-2 text-[0.78rem] text-fg-tertiary">
                    {g.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={`Recurring issues (${recurring.length})`} />
        <div className="px-4 py-3">
          {recurring.length === 0 ? (
            <p className="text-[0.875rem] text-fg-tertiary">
              Nothing recurring spotted yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recurring.slice(0, 4).map((i) => (
                <li key={i.id} className="text-[0.9375rem]">
                  {i.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={`Outstanding homework (${openHomework.length})`} />
        <div className="px-4 py-3">
          {openHomework.length === 0 ? (
            <p className="text-[0.875rem] text-fg-tertiary">All caught up.</p>
          ) : (
            <ul className="space-y-1.5">
              {openHomework.slice(0, 4).map((h) => (
                <li key={h.id} className="flex items-center gap-2 text-[0.9375rem]">
                  {h.title}
                  {h.dueAt && (
                    <span className="text-[0.78rem] text-fg-tertiary">
                      due {format(new Date(h.dueAt), "MMM d")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Latest vocabulary" />
        <div className="px-4 py-3">
          {vocabulary.length === 0 ? (
            <p className="text-[0.875rem] text-fg-tertiary">No vocabulary yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {vocabulary.slice(0, 12).map((v) => (
                <Badge key={v.id} tone="accent">
                  {v.term}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          title="Recent lessons"
          actions={
            latestLesson && (
              <span className="text-[0.8125rem] text-fg-tertiary">
                last{" "}
                {formatDistanceToNow(new Date(latestLesson.startedAt), {
                  addSuffix: true,
                })}
              </span>
            )
          }
        />
        <div className="px-4 py-3">
          {lessons.length === 0 ? (
            <p className="text-[0.875rem] text-fg-tertiary">
              No lessons yet — create the first one to start {student.name}
              &rsquo;s record.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lessons.slice(0, 5).map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/lessons/${l.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium">
                        {l.title ?? "Untitled lesson"}
                      </span>
                      <span className="block text-[0.8125rem] text-fg-tertiary">
                        {format(new Date(l.startedAt), "EEE, MMM d yyyy · HH:mm")}
                      </span>
                    </span>
                    <Badge tone={lessonStatusTone[l.status]}>{l.status}</Badge>
                    <ArrowRight className="size-3.5 text-fg-tertiary" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function LessonsTab({ profile }: { profile: StudentProfile }) {
  if (profile.lessons.length === 0) {
    return (
      <EmptyState
        icon={<BookOpenText />}
        title="No lessons yet"
        description="Create a lesson, paste your rough notes, and Class-room turns them into a structured record."
        action={<NewLessonDialog studentId={profile.student.id} />}
      />
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <NewLessonDialog studentId={profile.student.id} />
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {profile.lessons.map((l) => (
            <li key={l.id}>
              <Link
                href={`/lessons/${l.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium">
                    {l.title ?? "Untitled lesson"}
                  </span>
                  <span className="block text-[0.8125rem] text-fg-tertiary">
                    {format(new Date(l.startedAt), "EEE, MMM d yyyy · HH:mm")}
                    {l.durationMinutes ? ` · ${l.durationMinutes} min` : ""}
                  </span>
                  {l.summary && (
                    <span className="mt-0.5 block truncate text-[0.875rem] text-fg-secondary">
                      {l.summary}
                    </span>
                  )}
                </span>
                <Badge tone={lessonStatusTone[l.status]}>{l.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const teacher = await requireTeacher();
  const profile = await getStudentProfile(teacher.id, studentId);
  if (!profile) notFound();

  return (
    <div>
      <StudentHeader student={profile.student} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="lessons">
            Lessons ({profile.lessons.length})
          </TabsTrigger>
          <TabsTrigger value="corrections">
            Corrections ({profile.corrections.length})
          </TabsTrigger>
          <TabsTrigger value="vocabulary">
            Vocabulary ({profile.vocabulary.length})
          </TabsTrigger>
          <TabsTrigger value="homework">
            Homework ({profile.homework.length})
          </TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-5">
          <Overview profile={profile} />
        </TabsContent>
        <TabsContent value="timeline" className="pt-5">
          <TimelineSection profile={profile} />
        </TabsContent>
        <TabsContent value="progress" className="pt-5">
          <ProgressSection profile={profile} />
        </TabsContent>
        <TabsContent value="lessons" className="pt-5">
          <LessonsTab profile={profile} />
        </TabsContent>
        <TabsContent value="corrections" className="pt-5">
          <CorrectionsSection
            studentId={profile.student.id}
            corrections={profile.corrections}
          />
        </TabsContent>
        <TabsContent value="vocabulary" className="pt-5">
          <VocabularySection
            studentId={profile.student.id}
            vocabulary={profile.vocabulary}
          />
        </TabsContent>
        <TabsContent value="homework" className="pt-5">
          <HomeworkSection
            studentId={profile.student.id}
            homework={profile.homework}
          />
        </TabsContent>
        <TabsContent value="goals" className="pt-5">
          <GoalsSection studentId={profile.student.id} goals={profile.goals} />
        </TabsContent>
        <TabsContent value="insights" className="pt-5">
          <InsightsSection
            studentId={profile.student.id}
            insights={profile.insights}
          />
        </TabsContent>
        <TabsContent value="notes" className="pt-5">
          <NotesSection
            studentId={profile.student.id}
            notes={profile.student.generalNotes}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
