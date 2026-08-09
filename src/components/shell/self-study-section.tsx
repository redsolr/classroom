"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpenCheck,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Gauge,
  Layers,
  MessageCircle,
  Pin,
  PinOff,
  Plus,
} from "lucide-react";
import {
  createStudyThread,
  toggleStudyThreadPin,
} from "@/lib/actions/study";
import type { SidebarStudy, SidebarThread } from "@/lib/study-sidebar";
import { threadTitle } from "@/lib/study-display";
import {
  navRowClass,
  SectionLabel,
} from "@/components/shell/sidebar-shell";
import { cn } from "@/lib/utils";

/**
 * The SELF-STUDY sidebar section — ChatGPT-shaped tree:
 *
 *   Chat                       ▾
 *     Pinned                   (pinned chats, floated out of groups)
 *     <project folders>        (label → project page; + → chat inside)
 *       <chat history>
 *     New project
 *     Chats                    (loose chats, no project)
 *   Vocabulary / Review / Plan & usage
 */

const STATIC_ITEMS = [
  { href: "/study/vocab", label: "Vocabulary", icon: Layers, exact: true },
  { href: "/study/vocab/review", label: "Review", icon: BookOpenCheck },
  { href: "/study/account", label: "Plan & usage", icon: Gauge },
];

function ThreadRow({
  thread,
  active,
}: {
  thread: SidebarThread;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const togglePin = () => {
    startTransition(async () => {
      try {
        await toggleStudyThreadPin(thread.id);
        router.refresh();
      } catch (error) {
        console.error("sidebar: failed to toggle thread pin", error);
      }
    });
  };

  const PinIcon = thread.pinned ? PinOff : Pin;

  return (
    <div
      className={cn(
        "group flex items-center rounded-md pl-2.5 transition-colors",
        active ? "bg-accent-soft" : "hover:bg-surface-hover",
      )}
    >
      <Link
        href={`/study?t=${thread.id}`}
        className={cn(
          "min-w-0 flex-1 truncate py-1.5 pr-1 text-[0.875rem]",
          active ? "text-accent-text" : "text-fg",
        )}
      >
        {threadTitle(thread)}
      </Link>
      <button
        type="button"
        onClick={togglePin}
        disabled={pending}
        aria-label={thread.pinned ? "Unpin chat" : "Pin chat"}
        title={thread.pinned ? "Unpin" : "Pin"}
        className={cn(
          "mr-1 flex size-6 shrink-0 items-center justify-center rounded text-fg-tertiary transition-opacity hover:text-fg",
          thread.pinned
            ? "opacity-100"
            : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        <PinIcon className="size-3.5" />
      </button>
    </div>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-[1.35rem] border-l border-border pl-1.5">{children}</div>
  );
}

function StudyChatTree({ study }: { study: SidebarStudy }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = pathname === "/study" ? searchParams.get("t") : null;

  const hasContent =
    study.projects.length > 0 ||
    study.pinned.length > 0 ||
    study.chats.length > 0;

  const [open, setOpen] = React.useState(true);
  const [closedFolders, setClosedFolders] = React.useState<Set<string>>(
    () => new Set(),
  );

  const toggleFolder = (id: string) => {
    setClosedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div
        className={cn(navRowClass(pathname === "/study" && !activeId), "pr-1")}
      >
        <Link href="/study" className="flex min-w-0 flex-1 items-center gap-2.5">
          <MessageCircle className="size-4 shrink-0" />
          Chat
        </Link>
        {hasContent && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse chat list" : "Expand chat list"}
            className="flex size-6 shrink-0 items-center justify-center rounded text-fg-tertiary hover:text-fg"
          >
            {open ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-0.5 space-y-0.5">
          {study.pinned.length > 0 && (
            <Rail>
              <p className="px-2.5 pt-1 text-[0.72rem] font-semibold tracking-wider text-fg-tertiary uppercase">
                Pinned
              </p>
              {study.pinned.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  active={thread.id === activeId}
                />
              ))}
            </Rail>
          )}

          {study.projects.map((project) => {
            const folderOpen = !closedFolders.has(project.id);
            const onProjectPage = pathname === `/study/project/${project.id}`;
            return (
              <div key={project.id}>
                <div
                  className={cn(
                    "group flex items-center rounded-md pl-4 pr-1 transition-colors",
                    onProjectPage ? "bg-accent-soft" : "hover:bg-surface-hover",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleFolder(project.id)}
                    aria-label={
                      folderOpen
                        ? `Collapse ${project.name}`
                        : `Expand ${project.name}`
                    }
                    className="flex size-5 shrink-0 items-center justify-center text-fg-tertiary hover:text-fg"
                  >
                    {folderOpen ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                  </button>
                  <Link
                    href={`/study/project/${project.id}`}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-1 text-[0.875rem] font-medium",
                      onProjectPage ? "text-accent-text" : "text-fg",
                    )}
                  >
                    <Folder className="size-3.5 shrink-0 text-fg-tertiary" />
                    <span className="truncate">{project.name}</span>
                  </Link>
                  <form action={createStudyThread}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <button
                      type="submit"
                      aria-label={`Start ${project.name} chat`}
                      title={`Start a new chat in ${project.name}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-fg-tertiary opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </form>
                </div>
                {folderOpen && project.threads.length > 0 && (
                  <Rail>
                    {project.threads.map((thread) => (
                      <ThreadRow
                        key={thread.id}
                        thread={thread}
                        active={thread.id === activeId}
                      />
                    ))}
                  </Rail>
                )}
              </div>
            );
          })}

          <Link
            href="/study/project/new"
            className="flex items-center gap-2 rounded-md py-1.5 pr-2 pl-[1.6rem] text-[0.875rem] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <FolderPlus className="size-3.5" />
            New project
          </Link>

          {study.chats.length > 0 && (
            <Rail>
              <p className="px-2.5 pt-1 text-[0.72rem] font-semibold tracking-wider text-fg-tertiary uppercase">
                Chats
              </p>
              {study.chats.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  active={thread.id === activeId}
                />
              ))}
            </Rail>
          )}
        </div>
      )}
    </div>
  );
}

export function SelfStudySection({ study }: { study: SidebarStudy }) {
  const pathname = usePathname();
  return (
    <div className="mb-5">
      <SectionLabel>Self-study</SectionLabel>
      <nav className="flex flex-col gap-0.5">
        {/* useSearchParams lives below this Suspense boundary. */}
        <React.Suspense fallback={null}>
          <StudyChatTree study={study} />
        </React.Suspense>
        {STATIC_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={navRowClass(active)}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
