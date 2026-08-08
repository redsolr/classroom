"use client";

import {
  CalendarClock,
  GraduationCap,
  LogOut,
  UserRound,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import {
  NavSection,
  SELF_STUDY_ITEMS,
  SidebarShell,
  type NavEntry,
} from "@/components/shell/sidebar-shell";

const CLASSROOM_ITEMS: NavEntry[] = [
  { href: "/student/schedule", label: "Schedule", icon: CalendarClock },
  { href: "/student", label: "My class-room", icon: GraduationCap, exact: true },
  { href: "/student/teacher", label: "Teacher", icon: UserRound },
];

export function StudentSidebar({
  studentName,
  studentEmail,
}: {
  studentName: string;
  studentEmail: string | null;
}) {
  return (
    <SidebarShell homeHref="/student">
      <NavSection label="My class-room" items={CLASSROOM_ITEMS} />
      <NavSection label="Self-study" items={SELF_STUDY_ITEMS} />

      <div className="mt-auto">
        <Dropdown>
          <DropdownTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-hover focus:outline-none">
            <Avatar name={studentName} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.875rem] font-medium">
                {studentName}
              </span>
              {studentEmail && (
                <span className="block truncate text-[0.78rem] text-fg-tertiary">
                  {studentEmail}
                </span>
              )}
            </span>
          </DropdownTrigger>
          <DropdownContent align="start" className="w-52">
            <DropdownItem asChild>
              <a href="/logout">
                <LogOut className="size-4 text-fg-tertiary" />
                Sign out
              </a>
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </SidebarShell>
  );
}
