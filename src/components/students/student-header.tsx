"use client";

import * as React from "react";
import Link from "next/link";
import {
  Ban,
  ClipboardList,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import type { Student } from "@/db";
import {
  deleteStudent,
  disableStudentPortal,
  rotateStudentPortal,
  updateStudent,
} from "@/lib/actions/students";
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
        <h1 className="flex items-center gap-2.5 text-[1.5rem] font-semibold tracking-tight">
          {student.name}
          <Badge tone={studentStatusTone[student.status]}>
            {student.status}
          </Badge>
        </h1>
        <p className="mt-0.5 text-[0.9375rem] text-fg-secondary">
          {student.targetLanguage}
          {student.currentLevel ? ` · ${student.currentLevel}` : ""}
          {student.targetLevel ? ` → ${student.targetLevel}` : ""}
          {student.platform ? ` · ${student.platform}` : ""}
          {student.lessonFrequency ? ` · ${student.lessonFrequency}` : ""}
          {student.portalToken && (
            <>
              {" · "}
              <a
                href={`/p/${student.portalToken}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent-text hover:underline"
              >
                Student portal
                <ExternalLink className="size-3" />
              </a>
            </>
          )}
        </p>
      </div>

      <Link
        href={`/students/${student.id}/prep`}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-[0.875rem] font-medium shadow-sm transition-colors hover:bg-surface-hover"
      >
        <ClipboardList className="size-4 text-fg-tertiary" />
        Prep sheet
      </Link>

      <Dropdown>
        <DropdownTrigger
          aria-label="Student actions"
          className="rounded-md p-1.5 text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg focus:outline-none"
        >
          <MoreHorizontal className="size-4.5" />
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4 text-fg-tertiary" />
            Edit student
          </DropdownItem>
          <DropdownSeparator />
          {!student.portalToken ? (
            <DropdownItem
              onSelect={() => void rotateStudentPortal(student.id)}
            >
              <Link2 className="size-4 text-fg-tertiary" />
              Enable student portal
            </DropdownItem>
          ) : (
            <>
              <DropdownItem
                onSelect={() =>
                  void navigator.clipboard.writeText(
                    new URL(
                      `/p/${student.portalToken}`,
                      window.location.origin,
                    ).toString(),
                  )
                }
              >
                <Link2 className="size-4 text-fg-tertiary" />
                Copy portal link
              </DropdownItem>
              <DropdownItem
                onSelect={() => void rotateStudentPortal(student.id)}
              >
                <RefreshCcw className="size-4 text-fg-tertiary" />
                Regenerate portal link
              </DropdownItem>
              <DropdownItem
                onSelect={() => void disableStudentPortal(student.id)}
              >
                <Ban className="size-4 text-fg-tertiary" />
                Disable portal
              </DropdownItem>
            </>
          )}
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
