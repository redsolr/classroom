"use client";

import { updateStudentNotes } from "@/lib/actions/students";
import { SubmitButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

export function NotesSection({
  studentId,
  notes,
}: {
  studentId: string;
  notes: string | null;
}) {
  return (
    <form
      action={updateStudentNotes.bind(null, studentId)}
      className="space-y-3"
    >
      <p className="text-[0.875rem] text-fg-secondary">
        Private teacher notes — never included in recaps or anything the
        student sees.
      </p>
      <Textarea
        name="generalNotes"
        rows={10}
        defaultValue={notes ?? ""}
        placeholder="Anything you want to remember about this student…"
      />
      <div className="flex justify-end">
        <SubmitButton>Save notes</SubmitButton>
      </div>
    </form>
  );
}
