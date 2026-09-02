"use client";

import * as React from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { format } from "date-fns";
import { shareRecap, unshareRecap } from "@/lib/actions/lessons";
import type { LessonDetail } from "@/lib/queries";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card, CardHeader } from "@/components/ui/page-header";

function buildRecapText(detail: LessonDetail, summary: string, message: string): string {
  const parts: string[] = [];
  parts.push(
    `Lesson recap — ${format(new Date(detail.lesson.startedAt), "MMMM d, yyyy")}`,
  );
  parts.push("");
  parts.push(summary);
  const approved = detail.corrections.filter((c) => c.teacherApproved);
  if (approved.length > 0) {
    parts.push("");
    parts.push("Corrections to review:");
    for (const c of approved) {
      parts.push(
        `• ${c.originalText} → ${c.correctedText}${c.explanation ? ` (${c.explanation})` : ""}`,
      );
    }
  }
  if (detail.vocabulary.length > 0) {
    parts.push("");
    parts.push("New vocabulary:");
    for (const v of detail.vocabulary) {
      parts.push(
        `• ${v.term}${v.meaning ? ` — ${v.meaning}` : ""}${v.example ? ` (e.g. "${v.example}")` : ""}`,
      );
    }
  }
  if (detail.homework.length > 0) {
    parts.push("");
    parts.push("Homework:");
    for (const h of detail.homework) {
      parts.push(
        `• ${h.title}${h.dueAt ? ` (due ${format(new Date(h.dueAt), "MMM d")})` : ""}`,
      );
    }
  }
  if (message.trim()) {
    parts.push("");
    parts.push(message.trim());
  }
  return parts.join("\n");
}

function CopyButton({ getText, label }: { getText: () => string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      size="sm"
      onClick={() => {
        navigator.clipboard
          .writeText(getText())
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch((err) => console.error("[recap] clipboard write failed:", err));
      }}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function RecapPanel({ detail }: { detail: LessonDetail }) {
  const { lesson } = detail;
  const [summary, setSummary] = React.useState(lesson.studentVisibleSummary ?? "");
  const [message, setMessage] = React.useState(lesson.recapMessage ?? "");

  const shared = Boolean(lesson.recapToken);
  const publicUrl = lesson.recapToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${lesson.recapToken}`
    : null;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Share2 className="size-4 text-accent" />
            Student recap
          </span>
        }
        actions={
          shared ? (
            <span className="text-[0.8125rem] text-success">
              Shared{" "}
              <span suppressHydrationWarning>
                {lesson.recapSharedAt &&
                  format(new Date(lesson.recapSharedAt), "MMM d, HH:mm")}
              </span>
            </span>
          ) : undefined
        }
      />
      <div className="space-y-3 px-4 py-3">
        <p className="text-[0.8125rem] text-fg-secondary">
          A clean summary for the student. Only approved corrections,
          vocabulary and homework from this lesson are included — private
          notes and insights never appear.
        </p>
        <form action={shareRecap.bind(null, lesson.id)} className="space-y-3">
          <Field label="Summary for the student">
            <Textarea
              name="studentVisibleSummary"
              rows={4}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Great lesson today! We worked on…"
            />
          </Field>
          <Field label="Personal message" hint="Optional closing note">
            <Input
              name="recapMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="See you Thursday!"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton>
              {shared ? "Update recap" : "Share recap"}
            </SubmitButton>
            <CopyButton
              label="Copy as text"
              getText={() => buildRecapText(detail, summary, message)}
            />
            {publicUrl && (
              <CopyButton label="Copy link" getText={() => publicUrl} />
            )}
            {shared && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void unshareRecap(lesson.id)}
              >
                Unshare
              </Button>
            )}
          </div>
        </form>
        {publicUrl && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[0.875rem] text-accent-text hover:underline"
          >
            <Link2 className="size-3.5" />
            {publicUrl}
          </a>
        )}
      </div>
    </Card>
  );
}
