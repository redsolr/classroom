"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Student } from "@/db";
import { deleteStudent, updateStudent } from "@/lib/actions/students";
import { Avatar } from "@/components/ui/avatar";
import { Badge, studentStatusTone } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { StudentForm } from "./student-form";

export function StudentHeader({ student }: { student: Student }) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  return (
    <div className="mb-6 flex items-start gap-4">
      <Avatar name={student.name} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2.5 text-[1.25rem] font-semibold tracking-tight">
          {student.name}
          <Badge tone={studentStatusTone[student.status]}>
            {student.status}
          </Badge>
        </h1>
        <p className="mt-0.5 text-[0.85rem] text-fg-secondary">
          {student.targetLanguage}
          {student.currentLevel ? ` · ${student.currentLevel}` : ""}
          {student.targetLevel ? ` → ${student.targetLevel}` : ""}
          {student.platform ? ` · ${student.platform}` : ""}
          {student.lessonFrequency ? ` · ${student.lessonFrequency}` : ""}
        </p>
      </div>

      <Dropdown>
        <DropdownTrigger className="rounded-md p-1.5 text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg focus:outline-none">
          <MoreHorizontal className="size-4.5" />
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4 text-fg-tertiary" />
            Edit student
          </DropdownItem>
          <DropdownSeparator />
          {!confirmDelete ? (
            <DropdownItem
              className="text-danger data-[highlighted]:bg-danger-soft"
              onSelect={(e) => {
                e.preventDefault();
                setConfirmDelete(true);
              }}
            >
              <Trash2 className="size-4" />
              Delete student…
            </DropdownItem>
          ) : (
            <DropdownItem
              className="text-danger data-[highlighted]:bg-danger-soft"
              onSelect={() => void deleteStudent(student.id)}
            >
              <Trash2 className="size-4" />
              Confirm — delete everything
            </DropdownItem>
          )}
        </DropdownContent>
      </Dropdown>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent title="Edit student" className="max-w-xl">
          <StudentForm
            student={student}
            submitLabel="Save changes"
            action={async (fd) => {
              await updateStudent(student.id, fd);
              setEditOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
