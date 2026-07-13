"use client";

import { Lightbulb, Target } from "lucide-react";
import type { Goal, Insight } from "@/db";
import {
  createGoal,
  createInsight,
  deleteGoal,
  deleteInsight,
  setGoalStatus,
} from "@/lib/actions/students";
import {
  Badge,
  insightTypeLabel,
  insightTypeTone,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { Card } from "@/components/ui/page-header";

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const goalStatusTone = {
  active: "accent",
  completed: "success",
  paused: "neutral",
} as const;

function AddGoalDialog({ studentId }: { studentId: string }) {
  return (
    <FormDialog
      triggerLabel="Add goal"
      title="New learning goal"
      submitLabel="Add goal"
      action={(fd) => createGoal(studentId, fd)}
    >
      <Field label="Title">
        <Input
          name="title"
          required
          autoFocus
          placeholder="e.g. Prepare for DELF B2"
        />
      </Field>
      <Field label="Description">
        <Textarea name="description" rows={2} placeholder="Optional detail" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <Select name="priority" defaultValue="medium">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </Field>
        <Field label="Target date">
          <Input name="targetDate" type="date" />
        </Field>
      </div>
    </FormDialog>
  );
}

export function GoalsSection({
  studentId,
  goals,
}: {
  studentId: string;
  goals: Goal[];
}) {
  if (goals.length === 0) {
    return (
      <EmptyState
        icon={<Target />}
        title="No goals yet"
        description="Goals give every lesson a direction — and give the AI context for suggestions."
        action={<AddGoalDialog studentId={studentId} />}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AddGoalDialog studentId={studentId} />
      </div>
      {goals.map((g) => (
        <Card key={g.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p
              className={`text-[0.9375rem] font-medium ${g.status === "completed" ? "text-fg-tertiary line-through" : ""}`}
            >
              {g.title}
            </p>
            {g.description && (
              <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
                {g.description}
              </p>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              <Badge tone={goalStatusTone[g.status]}>{g.status}</Badge>
              <Badge>{g.priority} priority</Badge>
              {g.targetDate && (
                <span className="text-[0.78rem] text-fg-tertiary">
                  target {new Date(g.targetDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {g.status !== "completed" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void setGoalStatus(g.id, studentId, "completed")}
              >
                Complete
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void setGoalStatus(g.id, studentId, "active")}
              >
                Reopen
              </Button>
            )}
            <ConfirmButton action={() => deleteGoal(g.id, studentId)} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

function AddInsightDialog({ studentId }: { studentId: string }) {
  return (
    <FormDialog
      triggerLabel="Add insight"
      title="New insight"
      description="A longer-term observation about how this student learns. Never shown to the student."
      submitLabel="Add insight"
      action={(fd) => createInsight(studentId, fd)}
    >
      <Field label="Type">
        <Select name="type" defaultValue="generalObservation">
          {Object.entries(insightTypeLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title">
        <Input
          name="title"
          required
          autoFocus
          placeholder={`e.g. Confuses "depuis" and "pendant"`}
        />
      </Field>
      <Field label="Description">
        <Textarea name="description" rows={2} placeholder="Optional detail" />
      </Field>
    </FormDialog>
  );
}

export function InsightsSection({
  studentId,
  insights,
}: {
  studentId: string;
  insights: Insight[];
}) {
  if (insights.length === 0) {
    return (
      <EmptyState
        icon={<Lightbulb />}
        title="No insights yet"
        description="Insights are the student's long-term memory — recurring mistakes, preferences, interests. AI processing suggests them; you can add your own."
        action={<AddInsightDialog studentId={studentId} />}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AddInsightDialog studentId={studentId} />
      </div>
      {insights.map((i) => (
        <Card key={i.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-medium">{i.title}</p>
            {i.description && (
              <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
                {i.description}
              </p>
            )}
            <div className="mt-1.5">
              <Badge tone={insightTypeTone[i.type]}>
                {insightTypeLabel[i.type]}
              </Badge>
            </div>
          </div>
          <ConfirmButton action={() => deleteInsight(i.id, studentId)} />
        </Card>
      ))}
    </div>
  );
}
