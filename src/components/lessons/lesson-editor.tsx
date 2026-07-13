"use client";

import * as React from "react";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import type { LessonDetail } from "@/lib/queries";
import type { LessonDraft } from "@/lib/ai/draft-schema";
import { processLessonWithAI } from "@/lib/actions/ai";
import { updateLessonFields } from "@/lib/actions/lessons";
import {
  addCorrection,
  addHomework,
  addTopic,
  addVocabulary,
  deleteCorrection,
  deleteHomework,
  deleteTopic,
  deleteVocabulary,
} from "@/lib/actions/records";
import { Badge, correctionCategoryLabel } from "@/components/ui/badge";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, CardHeader } from "@/components/ui/page-header";
import { DraftReview } from "./draft-review";
import { RecapPanel } from "./recap-panel";

// ---------------------------------------------------------------------------
// Left column: raw input + AI processing + private notes
// ---------------------------------------------------------------------------

function InputPanel({
  detail,
  aiMode,
}: {
  detail: LessonDetail;
  aiMode: "claude" | "mock";
}) {
  const { lesson } = detail;
  const [rawInput, setRawInput] = React.useState(lesson.rawInput ?? "");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function process() {
    setError(null);
    startTransition(async () => {
      const result = await processLessonWithAI(lesson.id, rawInput);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader
        title="Lesson input"
        actions={
          aiMode === "mock" ? (
            <Badge tone="warning">AI mock mode</Badge>
          ) : undefined
        }
      />
      <div className="space-y-3 px-4 py-3">
        <Textarea
          rows={14}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder={
            "Paste rough notes, chat messages, or a transcript…\n\nExamples the mock parser understands:\n  she go -> she goes\n  vocab: nevertheless\n  hw: write 5 sentences with past tense\n  topic: job interviews"
          }
          className="font-mono text-[0.875rem]"
        />
        {error && <p className="text-[0.875rem] text-danger">{error}</p>}
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void (async () => {
                const fd = new FormData();
                fd.set("rawInput", rawInput);
                await updateLessonFields(lesson.id, fd);
              })()
            }
          >
            Save input
          </Button>
          <Button variant="primary" loading={pending} onClick={process}>
            <Sparkles className="size-3.5" />
            Process with AI
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PrivateNotesPanel({ detail }: { detail: LessonDetail }) {
  return (
    <Card>
      <CardHeader title="Private notes" />
      <form
        action={updateLessonFields.bind(null, detail.lesson.id)}
        className="space-y-3 px-4 py-3"
      >
        <Textarea
          name="teacherPrivateNotes"
          rows={5}
          defaultValue={detail.lesson.teacherPrivateNotes ?? ""}
          placeholder="Only you can see these."
        />
        <div className="flex justify-end">
          <SubmitButton size="sm">Save notes</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Right column: structured record
// ---------------------------------------------------------------------------

function SummaryPanel({ detail }: { detail: LessonDetail }) {
  return (
    <Card>
      <CardHeader title="Summary & next focus" />
      <form
        action={updateLessonFields.bind(null, detail.lesson.id)}
        className="space-y-3 px-4 py-3"
      >
        <Field label="Lesson summary">
          <Textarea
            name="summary"
            rows={3}
            defaultValue={detail.lesson.summary ?? ""}
            placeholder="What was covered, in a few sentences."
          />
        </Field>
        <Field label="Next lesson focus">
          <Textarea
            name="nextLessonFocus"
            rows={2}
            defaultValue={detail.lesson.nextLessonFocus ?? ""}
            placeholder="What to prepare or focus on next time."
          />
        </Field>
        <div className="flex justify-end">
          <SubmitButton size="sm">Save</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

function TopicsPanel({ detail }: { detail: LessonDetail }) {
  const { lesson, topics } = detail;
  const formRef = React.useRef<HTMLFormElement>(null);
  return (
    <Card>
      <CardHeader title={`Topics (${topics.length})`} />
      <div className="space-y-2 px-4 py-3">
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-[0.8125rem]"
              >
                {t.title}
                <ConfirmButton
                  action={() => deleteTopic(t.id, lesson.id)}
                  className="!px-0.5 !py-0"
                />
              </span>
            ))}
          </div>
        )}
        <form
          ref={formRef}
          action={async (fd) => {
            await addTopic(lesson.id, fd);
            formRef.current?.reset();
          }}
          className="flex items-center gap-2"
        >
          <Input name="title" required placeholder="Add a topic…" />
          <SubmitButton size="sm">
            <Plus className="size-3.5" />
          </SubmitButton>
        </form>
      </div>
    </Card>
  );
}

function LessonCorrectionsPanel({ detail }: { detail: LessonDetail }) {
  const { lesson, student, corrections } = detail;
  const formRef = React.useRef<HTMLFormElement>(null);
  return (
    <Card>
      <CardHeader title={`Corrections (${corrections.length})`} />
      <div className="space-y-2 px-4 py-3">
        {corrections.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-[0.9375rem]">
                <span className="text-danger line-through decoration-danger/50">
                  {c.originalText}
                </span>
                <ArrowRight className="size-3 shrink-0 text-fg-tertiary" />
                <span className="font-medium text-success">
                  {c.correctedText}
                </span>
                <Badge>{correctionCategoryLabel[c.category]}</Badge>
              </p>
              {c.explanation && (
                <p className="text-[0.8125rem] text-fg-tertiary">{c.explanation}</p>
              )}
            </div>
            <ConfirmButton
              action={() => deleteCorrection(c.id, student.id, lesson.id)}
            />
          </div>
        ))}
        <form
          ref={formRef}
          action={async (fd) => {
            await addCorrection(student.id, lesson.id, fd);
            formRef.current?.reset();
          }}
          className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2 border-t border-border pt-3"
        >
          <Input name="originalText" required placeholder="Student said…" />
          <Input name="correctedText" required placeholder="Correct form" />
          <Select name="category" defaultValue="grammar" className="w-32">
            {Object.entries(correctionCategoryLabel).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <SubmitButton size="sm">
            <Plus className="size-3.5" />
          </SubmitButton>
        </form>
      </div>
    </Card>
  );
}

function LessonVocabularyPanel({ detail }: { detail: LessonDetail }) {
  const { lesson, student, vocabulary } = detail;
  const formRef = React.useRef<HTMLFormElement>(null);
  return (
    <Card>
      <CardHeader title={`Vocabulary (${vocabulary.length})`} />
      <div className="space-y-2 px-4 py-3">
        {vocabulary.map((v) => (
          <div key={v.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-[0.9375rem]">
              <span className="font-medium">{v.term}</span>
              {v.meaning && (
                <span className="text-fg-secondary"> — {v.meaning}</span>
              )}
            </div>
            <ConfirmButton
              action={() => deleteVocabulary(v.id, student.id, lesson.id)}
            />
          </div>
        ))}
        <form
          ref={formRef}
          action={async (fd) => {
            await addVocabulary(student.id, lesson.id, fd);
            formRef.current?.reset();
          }}
          className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-t border-border pt-3"
        >
          <Input name="term" required placeholder="Term or phrase" />
          <Input name="meaning" placeholder="Meaning (optional)" />
          <SubmitButton size="sm">
            <Plus className="size-3.5" />
          </SubmitButton>
        </form>
      </div>
    </Card>
  );
}

function LessonHomeworkPanel({ detail }: { detail: LessonDetail }) {
  const { lesson, student, homework } = detail;
  const formRef = React.useRef<HTMLFormElement>(null);
  return (
    <Card>
      <CardHeader title={`Homework (${homework.length})`} />
      <div className="space-y-2 px-4 py-3">
        {homework.map((h) => (
          <div key={h.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-[0.9375rem]">
              <span className="font-medium">{h.title}</span>
              <Badge className="ml-2">{h.status}</Badge>
            </div>
            <ConfirmButton
              action={() => deleteHomework(h.id, student.id, lesson.id)}
            />
          </div>
        ))}
        <form
          ref={formRef}
          action={async (fd) => {
            await addHomework(student.id, lesson.id, fd);
            formRef.current?.reset();
          }}
          className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-border pt-3"
        >
          <Input name="title" required placeholder="Assign homework…" />
          <SubmitButton size="sm">
            <Plus className="size-3.5" />
          </SubmitButton>
        </form>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Editor layout
// ---------------------------------------------------------------------------

export function LessonEditor({
  detail,
  aiMode,
}: {
  detail: LessonDetail;
  aiMode: "claude" | "mock";
}) {
  const draft = detail.lesson.aiDraft as LessonDraft | null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <InputPanel detail={detail} aiMode={aiMode} />
        <PrivateNotesPanel detail={detail} />
      </div>
      <div className="space-y-4">
        {draft ? (
          <DraftReview lessonId={detail.lesson.id} draft={draft} />
        ) : (
          <>
            <SummaryPanel detail={detail} />
            <TopicsPanel detail={detail} />
            <LessonCorrectionsPanel detail={detail} />
            <LessonVocabularyPanel detail={detail} />
            <LessonHomeworkPanel detail={detail} />
            <RecapPanel detail={detail} />
          </>
        )}
      </div>
    </div>
  );
}
