"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { createLesson } from "@/lib/actions/lessons";
import { Button, SubmitButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { StudentCombobox } from "@/components/students/student-combobox";

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "New lesson" dialog. When `students` is provided, shows a student picker;
 * when `studentId` is fixed (student profile), it's a hidden field.
 *
 * Uncontrolled by default (renders its own trigger button). Pass `open` +
 * `onOpenChange` (and optionally `initialStart`) to control it externally —
 * the week calendar opens it prefilled with a clicked slot.
 */
export function NewLessonDialog({
  studentId,
  students,
  triggerLabel = "New lesson",
  open: controlledOpen,
  onOpenChange,
  initialStart,
  stay,
}: {
  studentId?: string;
  students?: { id: string; name: string }[];
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialStart?: string;
  /** "calendar": after creating, stay on the calendar with the booking highlighted. */
  stay?: "calendar";
}) {
  const controlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [defaultStart, setDefaultStart] = React.useState("");

  const open = controlled ? controlledOpen : uncontrolledOpen;
  const start = initialStart ?? defaultStart;

  function handleOpenChange(next: boolean) {
    // Compute the default lesson time at open (not at render) so the
    // server-rendered markup stays hydration-stable.
    if (next && !initialStart) setDefaultStart(toLocalDatetimeValue(new Date()));
    if (controlled) onOpenChange?.(next);
    else setUncontrolledOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant="primary">
            <Plus className="size-3.5" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent title="New lesson">
        <form action={createLesson} className="space-y-3">
          {stay && <input type="hidden" name="stay" value={stay} />}
          {studentId ? (
            <input type="hidden" name="studentId" value={studentId} />
          ) : (
            <Field label="Student">
              <StudentCombobox students={students ?? []} />
            </Field>
          )}
          <Field label="Title" hint="Optional — e.g. “Job interview practice”">
            <Input name="title" placeholder="Untitled lesson" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date & time" hint="A future time schedules the lesson">
              <Input
                name="startedAt"
                type="datetime-local"
                required
                defaultValue={start}
                key={start}
              />
            </Field>
            <Field label="Duration (min)">
              <Input
                name="durationMinutes"
                type="number"
                min={5}
                step={5}
                placeholder="60"
              />
            </Field>
          </div>
          <Field label="Input type">
            <Select name="sourceType" defaultValue="notes">
              <option value="notes">Rough notes</option>
              <option value="chat">Chat log</option>
              <option value="transcript">Transcript</option>
              <option value="manual">Manual entry</option>
            </Select>
          </Field>
          <div className="flex justify-end">
            <SubmitButton>Create lesson</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
