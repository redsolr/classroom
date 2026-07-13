"use client";

import Link from "next/link";
import { ArrowRight, BookMarked, ClipboardList, SpellCheck2 } from "lucide-react";
import type { Correction, Homework, VocabularyItem } from "@/db";
import {
  addCorrection,
  addHomework,
  addVocabulary,
  deleteCorrection,
  deleteHomework,
  deleteVocabulary,
  setHomeworkStatus,
  setVocabularyStatus,
} from "@/lib/actions/records";
import {
  Badge,
  correctionCategoryLabel,
  homeworkStatusTone,
  vocabularyStatusTone,
} from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { Card } from "@/components/ui/page-header";

/**
 * Student-profile record lists (corrections / vocabulary / homework) with
 * add, delete, and status controls. Lesson-scoped inline lists live in
 * the lesson editor.
 */

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

function AddCorrectionDialog({ studentId }: { studentId: string }) {
  return (
    <FormDialog
      triggerLabel="Add correction"
      title="New correction"
      submitLabel="Add correction"
      action={(fd) => addCorrection(studentId, null, fd)}
    >
      <Field label="Category">
        <Select name="category" defaultValue="grammar">
          {Object.entries(correctionCategoryLabel).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="What the student said">
        <Input name="originalText" required autoFocus />
      </Field>
      <Field label="Corrected form">
        <Input name="correctedText" required />
      </Field>
      <Field label="Explanation">
        <Textarea name="explanation" rows={2} placeholder="Optional" />
      </Field>
    </FormDialog>
  );
}

export function CorrectionsSection({
  studentId,
  corrections,
}: {
  studentId: string;
  corrections: Correction[];
}) {
  if (corrections.length === 0) {
    return (
      <EmptyState
        icon={<SpellCheck2 />}
        title="No corrections yet"
        description="Corrections captured from lessons build the student's error history."
        action={<AddCorrectionDialog studentId={studentId} />}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AddCorrectionDialog studentId={studentId} />
      </div>
      {corrections.map((c) => (
        <Card key={c.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[0.9375rem]">
              <span className="text-danger line-through decoration-danger/50">
                {c.originalText}
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-fg-tertiary" />
              <span className="font-medium text-success">{c.correctedText}</span>
            </p>
            {c.explanation && (
              <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
                {c.explanation}
              </p>
            )}
            <div className="mt-1.5">
              <Badge>{correctionCategoryLabel[c.category]}</Badge>
            </div>
          </div>
          <ConfirmButton
            action={() => deleteCorrection(c.id, studentId, c.lessonId)}
          />
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const VOCAB_STATUSES = ["new", "learning", "reviewing", "mastered"] as const;

function AddVocabularyDialog({ studentId }: { studentId: string }) {
  return (
    <FormDialog
      triggerLabel="Add vocabulary"
      title="New vocabulary item"
      submitLabel="Add vocabulary"
      action={(fd) => addVocabulary(studentId, null, fd)}
    >
      <Field label="Term">
        <Input name="term" required autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Meaning">
          <Input name="meaning" placeholder="Optional" />
        </Field>
        <Field label="Translation">
          <Input name="translation" placeholder="Optional" />
        </Field>
      </div>
      <Field label="Example sentence">
        <Input name="example" placeholder="Optional" />
      </Field>
    </FormDialog>
  );
}

export function VocabularySection({
  studentId,
  vocabulary,
}: {
  studentId: string;
  vocabulary: VocabularyItem[];
}) {
  if (vocabulary.length === 0) {
    return (
      <EmptyState
        icon={<BookMarked />}
        title="No vocabulary yet"
        description="Words and phrases introduced in lessons collect here for review."
        action={<AddVocabularyDialog studentId={studentId} />}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AddVocabularyDialog studentId={studentId} />
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {vocabulary.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-medium">{v.term}</p>
                {(v.meaning || v.translation) && (
                  <p className="text-[0.8125rem] text-fg-secondary">
                    {[v.meaning, v.translation].filter(Boolean).join(" · ")}
                  </p>
                )}
                {v.example && (
                  <p className="text-[0.8125rem] italic text-fg-tertiary">
                    “{v.example}”
                  </p>
                )}
              </div>
              <Select
                value={v.status}
                onChange={(e) =>
                  void setVocabularyStatus(
                    v.id,
                    studentId,
                    e.target.value as (typeof VOCAB_STATUSES)[number],
                  )
                }
                className="h-8 w-28 text-[0.8125rem]"
              >
                {VOCAB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Badge tone={vocabularyStatusTone[v.status]}>{v.status}</Badge>
              <ConfirmButton
                action={() => deleteVocabulary(v.id, studentId, v.lessonId)}
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Homework
// ---------------------------------------------------------------------------

const HOMEWORK_STATUSES = [
  "assigned",
  "submitted",
  "reviewed",
  "completed",
  "skipped",
] as const;

function AddHomeworkDialog({ studentId }: { studentId: string }) {
  return (
    <FormDialog
      triggerLabel="Assign homework"
      title="New homework"
      submitLabel="Assign"
      action={(fd) => addHomework(studentId, null, fd)}
    >
      <Field label="Title">
        <Input
          name="title"
          required
          autoFocus
          placeholder="e.g. Write 5 sentences using past tense"
        />
      </Field>
      <Field label="Description">
        <Textarea name="description" rows={2} placeholder="Optional" />
      </Field>
      <Field label="Due date">
        <Input name="dueAt" type="date" />
      </Field>
    </FormDialog>
  );
}

export function HomeworkSection({
  studentId,
  homework,
}: {
  studentId: string;
  homework: Homework[];
}) {
  if (homework.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="No homework yet"
        description="Homework assigned after lessons is tracked here until it's completed."
        action={<AddHomeworkDialog studentId={studentId} />}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AddHomeworkDialog studentId={studentId} />
      </div>
      {homework.map((h) => (
        <Card key={h.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p
              className={`text-[0.9375rem] font-medium ${["completed", "skipped"].includes(h.status) ? "text-fg-tertiary line-through" : ""}`}
            >
              {h.title}
            </p>
            {h.description && (
              <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
                {h.description}
              </p>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              <Badge tone={homeworkStatusTone[h.status]}>{h.status}</Badge>
              {h.dueAt && (
                <span className="text-[0.78rem] text-fg-tertiary">
                  due {new Date(h.dueAt).toLocaleDateString()}
                </span>
              )}
              {h.lessonId && (
                <Link
                  href={`/lessons/${h.lessonId}`}
                  className="text-[0.78rem] text-accent-text hover:underline"
                >
                  from lesson
                </Link>
              )}
            </div>
          </div>
          <Select
            value={h.status}
            onChange={(e) =>
              void setHomeworkStatus(
                h.id,
                studentId,
                e.target.value as (typeof HOMEWORK_STATUSES)[number],
              )
            }
            className="h-8 w-28 shrink-0 text-[0.8125rem]"
          >
            {HOMEWORK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <ConfirmButton
            action={() => deleteHomework(h.id, studentId, h.lessonId)}
          />
        </Card>
      ))}
    </div>
  );
}
