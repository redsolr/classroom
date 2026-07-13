import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  ClipboardCheck,
  Compass,
  Lightbulb,
  MessageSquareQuote,
  Target,
} from "lucide-react";
import { requireTeacher } from "@/lib/auth";
import { getPrepSheet, type PrepSheet } from "@/lib/queries";
import { Avatar } from "@/components/ui/avatar";
import {
  Badge,
  correctionCategoryLabel,
  homeworkStatusTone,
  insightTypeLabel,
  insightTypeTone,
  vocabularyStatusTone,
} from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/page-header";
import { NewLessonDialog } from "@/components/lessons/new-lesson-dialog";

export const metadata: Metadata = { title: "Prep sheet" };

function SectionTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-fg-tertiary [&>svg]:size-4">{icon}</span>
      {children}
    </span>
  );
}

function MistakesToRedrill({ sheet }: { sheet: PrepSheet }) {
  return (
    <Card>
      <CardHeader
        title={
          <SectionTitle icon={<MessageSquareQuote />}>
            Mistakes to re-drill
          </SectionTitle>
        }
      />
      <div className="px-4 py-3">
        {sheet.recentCorrections.length === 0 ? (
          <p className="text-[0.875rem] text-fg-tertiary">
            No corrections on record yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {sheet.recentCorrections.map((c) => (
              <li key={c.id} className="py-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.9375rem]">
                  <span className="text-danger line-through decoration-danger/40">
                    {c.originalText}
                  </span>
                  <span aria-hidden className="text-fg-tertiary">
                    →
                  </span>
                  <span className="font-medium text-success">
                    {c.correctedText}
                  </span>
                  <Badge tone="neutral">
                    {correctionCategoryLabel[c.category]}
                  </Badge>
                </div>
                {c.explanation && (
                  <p className="mt-0.5 text-[0.8125rem] text-fg-tertiary">
                    {c.explanation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default async function PrepSheetPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const teacher = await requireTeacher();
  const sheet = await getPrepSheet(teacher.id, studentId);
  if (!sheet) notFound();

  const { student, lastLesson } = sheet;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/students/${student.id}`}
        className="inline-flex items-center gap-1 text-[0.8125rem] text-fg-tertiary transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-3.5" />
        Back to {student.name}
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Avatar name={student.name} size="lg" />
          <div>
            <h1 className="text-[1.5rem] font-semibold tracking-tight">
              Next lesson with {student.name}
            </h1>
            <p className="mt-0.5 text-[0.9375rem] text-fg-secondary">
              {student.targetLanguage}
              {student.currentLevel ? ` · ${student.currentLevel}` : ""}
              {lastLesson
                ? ` · last lesson ${formatDistanceToNow(
                    new Date(lastLesson.startedAt),
                    { addSuffix: true },
                  )}`
                : " · no lessons yet"}
            </p>
          </div>
        </div>
        <NewLessonDialog studentId={student.id} />
      </div>

      <div className="space-y-4">
        <Card className="border-l-2 border-l-accent">
          <div className="flex items-start gap-3 px-4 py-3.5">
            <Compass className="mt-0.5 size-4.5 shrink-0 text-accent" />
            <div>
              <p className="text-[0.875rem] font-semibold text-fg-secondary">
                Suggested focus
              </p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed">
                {sheet.nextFocus ??
                  "No suggestion yet — process a lesson and one will appear here."}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <SectionTitle icon={<ClipboardCheck />}>
                Homework to check ({sheet.openHomework.length})
              </SectionTitle>
            }
          />
          <div className="px-4 py-3">
            {sheet.openHomework.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                Nothing outstanding — all homework is closed out.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {sheet.openHomework.map((h) => (
                  <li key={h.id} className="flex items-center gap-2.5 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem]">
                        {h.title}
                      </span>
                      <span className="block text-[0.78rem] text-fg-tertiary">
                        {h.dueAt
                          ? `due ${format(new Date(h.dueAt), "MMM d")}`
                          : "no due date"}
                      </span>
                    </span>
                    <Badge tone={homeworkStatusTone[h.status]}>{h.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <MistakesToRedrill sheet={sheet} />

        <Card>
          <CardHeader
            title={
              <SectionTitle icon={<BookOpenText />}>
                Vocabulary to review ({sheet.reviewVocabulary.length})
              </SectionTitle>
            }
          />
          <div className="px-4 py-3">
            {sheet.reviewVocabulary.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                Nothing waiting for review.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {sheet.reviewVocabulary.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-baseline gap-2 py-1.5 text-[0.9375rem]"
                  >
                    <span className="font-medium">{v.term}</span>
                    {v.meaning && (
                      <span className="min-w-0 truncate text-fg-secondary">
                        — {v.meaning}
                      </span>
                    )}
                    <Badge
                      tone={vocabularyStatusTone[v.status]}
                      className="ml-auto"
                    >
                      {v.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <SectionTitle icon={<Lightbulb />}>Keep in mind</SectionTitle>
            }
          />
          <div className="px-4 py-3">
            {sheet.insights.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                No teaching insights recorded yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {sheet.insights.map((i) => (
                  <li key={i.id} className="text-[0.9375rem]">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Badge tone={insightTypeTone[i.type]}>
                        {insightTypeLabel[i.type]}
                      </Badge>
                      <span className="font-medium">{i.title}</span>
                    </div>
                    {i.description && (
                      <p className="mt-0.5 text-[0.8125rem] text-fg-tertiary">
                        {i.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <SectionTitle icon={<Target />}>
                Active goals ({sheet.activeGoals.length})
              </SectionTitle>
            }
          />
          <div className="px-4 py-3">
            {sheet.activeGoals.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                No active goals.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {sheet.activeGoals.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-baseline gap-2 text-[0.9375rem]"
                  >
                    {g.title}
                    <span className="text-[0.78rem] text-fg-tertiary">
                      {g.priority}
                      {g.targetDate
                        ? ` · target ${format(new Date(g.targetDate), "MMM d")}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {lastLesson && (
          <Card>
            <CardHeader
              title="Last lesson"
              actions={
                <Link
                  href={`/lessons/${lastLesson.id}`}
                  className="inline-flex items-center gap-1 text-[0.8125rem] text-accent-text hover:underline"
                >
                  Open
                  <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <div className="px-4 py-3">
              <p className="text-[0.9375rem] font-medium">
                {lastLesson.title ?? "Untitled lesson"}
                <span className="ml-2 text-[0.8125rem] font-normal text-fg-tertiary">
                  {format(new Date(lastLesson.startedAt), "EEE, MMM d · HH:mm")}
                  {lastLesson.durationMinutes
                    ? ` · ${lastLesson.durationMinutes} min`
                    : ""}
                </span>
              </p>
              {lastLesson.summary && (
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-fg-secondary">
                  {lastLesson.summary}
                </p>
              )}
              {sheet.lastLessonTopics.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {sheet.lastLessonTopics.map((t) => (
                    <Badge key={t.id} tone="accent">
                      {t.title}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
