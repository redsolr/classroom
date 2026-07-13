"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Plus, Search, Users } from "lucide-react";
import type { StudentListRow } from "@/lib/queries";
import { createStudent } from "@/lib/actions/students";
import { Avatar } from "@/components/ui/avatar";
import { Badge, studentStatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { ImportStudentsDialog } from "./import-students-dialog";
import { StudentForm } from "./student-form";

const STATUS_FILTERS = ["all", "active", "trial", "paused", "inactive"] as const;

export function StudentsTable({ students }: { students: StudentListRow[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] =
    React.useState<(typeof STATUS_FILTERS)[number]>("all");
  const [source, setSource] = React.useState("all sources");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const sources = [
    "all sources",
    ...[...new Set(students.map((s) => s.platform).filter(Boolean))] as string[],
  ];

  const filtered = students.filter((s) => {
    if (status !== "all" && s.status !== status) return false;
    if (source !== "all sources" && s.platform !== source) return false;
    if (query && !s.name.toLowerCase().includes(query.toLowerCase()) &&
        !s.targetLanguage.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

  const newStudentDialog = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus className="size-3.5" />
          New student
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New student"
        description="Add a learner to your class-room."
        className="max-w-xl"
      >
        <StudentForm action={createStudent} submitLabel="Create student" />
      </DialogContent>
    </Dialog>
  );

  if (students.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="No students yet"
        description="Add your first student to start building their learning record."
        action={newStudentDialog}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students…"
            className="w-56 pl-8"
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              className={`rounded-md px-2 py-1 text-[0.8125rem] font-medium capitalize transition-colors ${
                status === f
                  ? "bg-accent-soft text-accent-text"
                  : "text-fg-secondary hover:bg-surface-hover"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {sources.length > 1 && (
          <div className="flex items-center gap-1 border-l border-border pl-2">
            {sources.map((f) => (
              <button
                key={f}
                onClick={() => setSource(f)}
                className={`rounded-md px-2 py-1 text-[0.8125rem] font-medium transition-colors ${
                  source === f
                    ? "bg-accent-soft text-accent-text"
                    : "text-fg-secondary hover:bg-surface-hover"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ImportStudentsDialog />
          {newStudentDialog}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface shadow-card">
        <table className="w-full text-[0.9375rem]">
          <thead>
            <tr className="border-b border-border text-left text-[0.8125rem] font-medium text-fg-tertiary">
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Level</th>
              <th className="px-4 py-2.5 font-medium">Lessons</th>
              <th className="px-4 py-2.5 font-medium">Last lesson</th>
              <th className="px-4 py-2.5 font-medium">Open homework</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                onClick={() => router.push(`/students/${s.id}`)}
                className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-hover"
              >
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={s.name} />
                    <span>
                      <Link
                        href={`/students/${s.id}`}
                        className="block font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.name}
                      </Link>
                      <span className="block text-[0.78rem] text-fg-tertiary">
                        {s.targetLanguage}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-fg-secondary">
                  {s.platform ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={studentStatusTone[s.status]}>{s.status}</Badge>
                </td>
                <td className="px-4 py-2.5 text-fg-secondary">
                  {s.currentLevel ?? "—"}
                  {s.targetLevel ? ` → ${s.targetLevel}` : ""}
                </td>
                <td className="px-4 py-2.5 text-fg-secondary">{s.lessonCount}</td>
                <td className="px-4 py-2.5 text-fg-secondary">
                  {s.lastLessonAt
                    ? formatDistanceToNow(new Date(s.lastLessonAt), {
                        addSuffix: true,
                      })
                    : "Never"}
                </td>
                <td className="px-4 py-2.5">
                  {s.openHomeworkCount > 0 ? (
                    <Badge tone="warning">{s.openHomeworkCount} open</Badge>
                  ) : (
                    <span className="text-fg-tertiary">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-fg-tertiary">
                  No students match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
