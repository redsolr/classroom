"use client";

import * as React from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { importStudents } from "@/lib/actions/students";
import { Button, SubmitButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";

export function ImportStudentsDialog() {
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<{
    created: number;
    skipped: number;
  } | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Upload className="size-3.5" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Import students"
        description="Paste from a spreadsheet or CSV — one student per line."
        className="max-w-xl"
      >
        {result ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-[0.9375rem]">
              <CheckCircle2 className="size-4.5 text-success" />
              Imported {result.created} student
              {result.created === 1 ? "" : "s"}
              {result.skipped > 0
                ? ` · skipped ${result.skipped} line${result.skipped === 1 ? "" : "s"} without a name`
                : ""}
              .
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            action={async (fd) => {
              setResult(await importStudents(fd));
            }}
            className="space-y-3"
          >
            <Field
              label="Students"
              hint="Columns: name, target language, level, source — comma or tab separated; only the name is required"
            >
              <Textarea
                name="list"
                rows={8}
                required
                placeholder={
                  "Maria García, Spanish, B2, italki\nKenji Sato, English, A2, Preply\nDavid Cohen"
                }
              />
            </Field>
            <Field
              label="Default target language"
              hint="Used when a line has no language column"
            >
              <Input name="defaultLanguage" defaultValue="English" required />
            </Field>
            <div className="flex justify-end">
              <SubmitButton>Import students</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
