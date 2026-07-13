"use client";

import type { Student } from "@/db";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

/**
 * Shared create/edit student form. Pass a server action as `action`
 * and optionally an existing student for edit mode.
 */
export function StudentForm({
  action,
  student,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  student?: Student;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" className="col-span-2">
          <Input
            name="name"
            required
            defaultValue={student?.name}
            placeholder="e.g. Marie Dubois"
            autoFocus
          />
        </Field>
        <Field label="Target language">
          <Input
            name="targetLanguage"
            required
            defaultValue={student?.targetLanguage}
            placeholder="e.g. English"
          />
        </Field>
        <Field label="Native language">
          <Input
            name="nativeLanguage"
            defaultValue={student?.nativeLanguage ?? ""}
            placeholder="e.g. French"
          />
        </Field>
        <Field label="Current level">
          <Input
            name="currentLevel"
            defaultValue={student?.currentLevel ?? ""}
            placeholder="e.g. B1"
          />
        </Field>
        <Field label="Target level">
          <Input
            name="targetLevel"
            defaultValue={student?.targetLevel ?? ""}
            placeholder="e.g. C1"
          />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={student?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="paused">Paused</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Email">
          <Input
            name="email"
            type="email"
            defaultValue={student?.email ?? ""}
            placeholder="Optional"
          />
        </Field>
        <Field label="Platform">
          <Input
            name="platform"
            defaultValue={student?.platform ?? ""}
            placeholder="e.g. italki, Preply, Zoom"
          />
        </Field>
        <Field label="Lesson frequency">
          <Input
            name="lessonFrequency"
            defaultValue={student?.lessonFrequency ?? ""}
            placeholder="e.g. 2x per week"
          />
        </Field>
        <Field label="Timezone">
          <Input
            name="timezone"
            defaultValue={student?.timezone ?? ""}
            placeholder="e.g. Europe/Paris"
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
