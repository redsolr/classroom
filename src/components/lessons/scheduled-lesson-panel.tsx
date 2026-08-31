"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  CalendarClock,
  CalendarX2,
  CheckCheck,
  ClipboardList,
  UserX,
  Video,
} from "lucide-react";
import type { LessonDetail } from "@/lib/queries";
import { callPath } from "@/lib/call-path";
import {
  cancelLesson,
  markLessonAttended,
  markLessonNoShow,
  rescheduleLesson,
} from "@/lib/actions/lessons";
import { Button, SubmitButton } from "@/components/ui/button";
import { Card } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { toLocalDatetimeValue } from "@/lib/datetime";

export function ScheduledLessonPanel({ detail }: { detail: LessonDetail }) {
  const { lesson, student } = detail;
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  return (
    <Card>
      <div className="flex items-start gap-3 px-4 py-4">
        <CalendarClock className="mt-0.5 size-4.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-medium">
            Scheduled for{" "}
            {format(new Date(lesson.startedAt), "EEEE, MMMM d yyyy · HH:mm")}
            {lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ""}
          </p>
          <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
            When the lesson happens, mark it attended to start taking notes.
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {/* The room is always reachable, not only in the minutes
                around the start time. A teacher checking their camera an
                hour early is doing the right thing, and a lesson running
                late is exactly when a locked door costs the most. */}
            <LinkButton href={callPath(lesson.id)}>
              <Video className="size-3.5 text-fg-tertiary" />
              Join call
            </LinkButton>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void markLessonAttended(lesson.id)}
            >
              <CheckCheck className="size-3.5" />
              Mark attended
            </Button>
            <LinkButton href={`/students/${student.id}/prep`}>
              <ClipboardList className="size-3.5 text-fg-tertiary" />
              Prep sheet
            </LinkButton>
            <Button size="sm" onClick={() => setRescheduleOpen(true)}>
              <CalendarClock className="size-3.5" />
              Reschedule
            </Button>
            <Button size="sm" onClick={() => void markLessonNoShow(lesson.id)}>
              <UserX className="size-3.5" />
              Student no-show
            </Button>
            {!confirmCancel ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmCancel(true)}
              >
                <CalendarX2 className="size-3.5" />
                Cancel lesson…
              </Button>
            ) : (
              <Button
                variant="danger"
                size="sm"
                onClick={() => void cancelLesson(lesson.id)}
              >
                <CalendarX2 className="size-3.5" />
                Confirm cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent title="Reschedule lesson">
          <form
            action={(fd) => rescheduleLesson(lesson.id, fd)}
            className="space-y-3"
          >
            <Field label="New date & time">
              <Input
                name="startedAt"
                type="datetime-local"
                required
                defaultValue={toLocalDatetimeValue(
                  new Date(lesson.startedAt),
                )}
              />
            </Field>
            <div className="flex justify-end">
              <SubmitButton>Reschedule</SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
