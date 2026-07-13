import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth";
import { updateTeacherProfile } from "@/lib/actions/teacher";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, CardHeader, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const teacher = await requireTeacher();

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your teacher profile" />
      <Card className="max-w-xl">
        <CardHeader title="Profile" />
        <form action={updateTeacherProfile} className="space-y-4 px-4 py-4">
          <Field label="Name">
            <Input name="name" required defaultValue={teacher.name ?? ""} />
          </Field>
          <Field label="Email">
            <Input value={teacher.email} disabled />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Timezone">
              <Input
                name="timezone"
                defaultValue={teacher.timezone ?? ""}
                placeholder="e.g. Asia/Bangkok"
              />
            </Field>
            <Field label="Native language">
              <Input
                name="nativeLanguage"
                defaultValue={teacher.nativeLanguage ?? ""}
                placeholder="e.g. English"
              />
            </Field>
          </div>
          <Field
            label="Languages you teach"
            hint="Comma-separated, e.g. English, French"
          >
            <Input
              name="languagesTaught"
              defaultValue={(teacher.languagesTaught ?? []).join(", ")}
            />
          </Field>
          <div className="flex justify-end">
            <SubmitButton>Save profile</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
