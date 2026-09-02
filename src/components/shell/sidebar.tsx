"use client";

import Link from "next/link";
import {
  Banknote,
  BookOpenText,
  CalendarClock,
  CalendarDays,
  Gauge,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Settings,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import {
  NavSection,
  SidebarShell,
  type NavEntry,
} from "@/components/shell/sidebar-shell";
import { SelfStudySection } from "@/components/shell/self-study-section";
import type { SidebarStudy } from "@/lib/study-sidebar";

const TEACHING_ITEMS: NavEntry[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/schedule", label: "Schedule", icon: CalendarClock },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/students", label: "Students", icon: Users },
  // Directly under Students: the two are the same relationship seen from
  // either end, and what happens BETWEEN lessons is the tutor's actual
  // job here.
  { href: "/messages", label: "Messages", icon: MessagesSquare },
  { href: "/lessons", label: "Lessons", icon: BookOpenText },
  // Last in the teaching cluster: it's where a tutor sets things up once
  // and then checks earnings, not somewhere they go between lessons.
  { href: "/teaching/payouts", label: "Teaching & payouts", icon: Banknote },
];

export function Sidebar({
  teacherName,
  teacherEmail,
  study,
  unreadMessages = 0,
}: {
  teacherName: string;
  teacherEmail: string;
  study: SidebarStudy;
  unreadMessages?: number;
}) {
  const items = TEACHING_ITEMS.map((item) =>
    item.href === "/messages" ? { ...item, badge: unreadMessages } : item,
  );

  return (
    <SidebarShell homeHref="/schedule">
      <NavSection items={items} />
      <SelfStudySection study={study} />

      <div className="mt-auto">
        <Dropdown>
          <DropdownTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-hover focus:outline-none">
            <Avatar name={teacherName} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.875rem] font-medium">
                {teacherName}
              </span>
              <span className="block truncate text-[0.78rem] text-fg-tertiary">
                {teacherEmail}
              </span>
            </span>
          </DropdownTrigger>
          <DropdownContent align="start" className="w-52">
            <DropdownItem asChild>
              <Link href="/settings">
                <Settings className="size-4 text-fg-tertiary" />
                Settings
              </Link>
            </DropdownItem>
            <DropdownItem asChild>
              <Link href="/account">
                <Gauge className="size-4 text-fg-tertiary" />
                Plan &amp; usage
              </Link>
            </DropdownItem>
            <DropdownSeparator />
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
