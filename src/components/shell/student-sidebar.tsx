"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  GraduationCap,
  LogOut,
  Sparkles,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";

const nav = [
  { href: "/student/schedule", label: "Schedule", icon: CalendarClock },
  { href: "/student", label: "My class-room", icon: GraduationCap },
  { href: "/student/teacher", label: "Teacher", icon: UserRound },
  { href: "/study", label: "Self-study", icon: Sparkles },
];

export function StudentSidebar({
  studentName,
  studentEmail,
}: {
  studentName: string;
  studentEmail: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface px-3 py-5">
      <Link
        href="/student"
        className="mb-6 flex items-center gap-2 px-2 text-[1rem] font-semibold tracking-tight"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-accent text-white">
          <GraduationCap className="size-4" />
        </span>
        Class-room
      </Link>

      <nav className="flex flex-col gap-0.5">
        {nav.map((item) => {
          const active =
            item.href === "/student"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.9375rem] font-medium transition-colors",
                active
                  ? "bg-accent-soft text-accent-text"
                  : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

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
    </aside>
  );
}
