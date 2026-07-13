"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CheckCheck, MoreHorizontal, Trash2 } from "lucide-react";
import type { LessonDetail } from "@/lib/queries";
import {
  deleteLesson,
  markLessonReviewed,
  updateLessonFields,
} from "@/lib/actions/lessons";
import { Avatar } from "@/components/ui/avatar";
import { Badge, lessonStatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";

export function LessonHeader({ detail }: { detail: LessonDetail }) {
  const { lesson, student } = detail;
  const [title, setTitle] = React.useState(lesson.title ?? "");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  function saveTitle() {
    if ((lesson.title ?? "") === title) return;
    const fd = new FormData();
    fd.set("title", title);
    void updateLessonFields(lesson.id, fd);
  }

  const canMarkReviewed =
    !lesson.aiDraft && (lesson.status === "draft" || lesson.status === "processed");

  return (
    <div className="mb-6">
      <Link
        href={`/students/${student.id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-[0.8rem] text-fg-secondary transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-3.5" />
        <Avatar name={student.name} size="sm" />
        {student.name}
      </Link>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Untitled lesson"
            className="w-full bg-transparent text-[1.25rem] font-semibold tracking-tight outline-none placeholder:text-fg-tertiary"
          />
          <p className="mt-0.5 text-[0.85rem] text-fg-secondary">
            {format(new Date(lesson.startedAt), "EEEE, MMMM d yyyy · HH:mm")}
            {lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ""}
          </p>
        </div>

        <Badge tone={lessonStatusTone[lesson.status]} className="mt-1.5">
          {lesson.status}
        </Badge>

        {canMarkReviewed && (
          <Button
            size="sm"
            onClick={() => void markLessonReviewed(lesson.id)}
            className="mt-0.5"
          >
            <CheckCheck className="size-3.5" />
            Mark reviewed
          </Button>
        )}

        <Dropdown>
          <DropdownTrigger className="mt-0.5 rounded-md p-1.5 text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg focus:outline-none">
            <MoreHorizontal className="size-4.5" />
          </DropdownTrigger>
          <DropdownContent>
            {!confirmDelete ? (
              <DropdownItem
                className="text-danger data-[highlighted]:bg-danger-soft"
                onSelect={(e) => {
                  e.preventDefault();
                  setConfirmDelete(true);
                }}
              >
                <Trash2 className="size-4" />
                Delete lesson…
              </DropdownItem>
            ) : (
              <DropdownItem
                className="text-danger data-[highlighted]:bg-danger-soft"
                onSelect={() => void deleteLesson(lesson.id)}
              >
                <Trash2 className="size-4" />
                Confirm delete
              </DropdownItem>
            )}
          </DropdownContent>
        </Dropdown>
      </div>
    </div>
  );
}
