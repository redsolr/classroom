"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpenCheck,
  Folder,
  Gauge,
  Layers,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Settings,
  SquarePen,
  Trash2,
} from "lucide-react";
import {
  createStudyThread,
  deleteStudyProject,
  deleteStudyThread,
  renameStudyThread,
  toggleStudyThreadPin,
} from "@/lib/actions/study";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { NewProjectDialog } from "@/components/study/new-project-dialog";
import type { SidebarStudy, SidebarThread } from "@/lib/study-sidebar";
import { threadTitle } from "@/lib/study-display";
import {
  navRowClass,
  SectionLabel,
} from "@/components/shell/sidebar-shell";
import { cn } from "@/lib/utils";

/**
 * The SELF-STUDY sidebar — ChatGPT-shaped sections, no folder nesting:
 *
 *   Chat                      (→ /study, the new-chat hero)
 *   Pinned                    chat rows (any chat the learner pinned)
 *   Projects              +   folder rows → the project page (its chats
 *                             live THERE, like ChatGPT); hover: new chat
 *                             in project + ⋯ (settings / delete)
 *   Chats                     loose chats; every chat row gets a ⋯ menu
 *                             (pin / rename inline / delete)
 *   Vocabulary / Review / Plan & usage
 */

const STATIC_ITEMS = [
  { href: "/study/vocab", label: "Vocabulary", icon: Layers, exact: true },
  { href: "/study/vocab/review", label: "Review", icon: BookOpenCheck },
  { href: "/study/account", label: "Plan & usage", icon: Gauge },
];

/** Hover-reveal on desktop; always visible on touch (no hover). */
const rowActionClass =
  "flex size-6 shrink-0 items-center justify-center rounded text-fg-tertiary transition-opacity hover:text-fg opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100 data-[state=open]:opacity-100 data-[state=open]:text-fg";

function ThreadRow({
  thread,
  active,
}: {
  thread: SidebarThread;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const title = threadTitle(thread);

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

  const startRename = () => {
    setDraft(title);
    setRenaming(true);
    // Radix returns focus to the menu trigger on close — steal it back
    // to the input after that happens.
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = () => {
    const next = draft.trim();
    setRenaming(false);
    if (!next || next === title) return;
    startTransition(async () => {
      try {
        await renameStudyThread(thread.id, next);
        router.refresh();
      } catch (error) {
        console.error("sidebar: failed to rename thread", error);
      }
    });
  };

  const deleteChat = () => {
    if (!window.confirm("Delete this chat and its messages?")) return;
    startTransition(async () => {
      try {
        await deleteStudyThread(thread.id);
        router.refresh();
      } catch (error) {
        console.error("sidebar: failed to delete thread", error);
      }
    });
  };

  if (renaming) {
    return (
      <div className="flex items-center gap-2 rounded-md py-1 pl-2.5">
        <MessageCircle className="size-3.5 shrink-0 text-fg-tertiary" />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              commitRename();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setRenaming(false);
            }
          }}
          maxLength={120}
          aria-label="Rename chat"
          className="w-full min-w-0 rounded border border-accent bg-transparent px-1 py-0.5 text-[0.875rem] focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center rounded-md pr-1 pl-2.5 transition-colors",
        active ? "bg-accent-soft" : "hover:bg-surface-hover",
      )}
    >
      <Link
        href={`/study?t=${thread.id}`}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-[0.875rem]",
          active ? "text-accent-text" : "text-fg",
        )}
      >
        <MessageCircle className="size-3.5 shrink-0 text-fg-tertiary" />
        <span className="truncate">{title}</span>
      </Link>
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label={`${title} options`}
            title="Chat options"
            className={rowActionClass}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownTrigger>
        <DropdownContent align="start" className="w-48">
          <DropdownItem disabled={pending} onSelect={togglePin}>
            {thread.pinned ? (
              <PinOff className="size-4 text-fg-tertiary" />
            ) : (
              <Pin className="size-4 text-fg-tertiary" />
            )}
            {thread.pinned ? "Unpin" : "Pin"}
          </DropdownItem>
          <DropdownItem disabled={pending} onSelect={startRename}>
            <Pencil className="size-4 text-fg-tertiary" />
            Rename
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            disabled={pending}
            className="text-danger"
            onSelect={deleteChat}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
    </div>
  );
}

/** The project row's ⋯ menu — settings (where the project's context/
 * instructions live) and delete. The row LABEL navigates to the page. */
function ProjectMenu({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label={`${projectName} options`}
          title="Project options"
          className={rowActionClass}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="start" className="w-52">
        <DropdownItem asChild>
          <Link href={`/study/project/${projectId}`}>
            <Settings className="size-4 text-fg-tertiary" />
            Project settings
          </Link>
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          disabled={pending}
          className="text-danger"
          onSelect={() => {
            if (
              !window.confirm(
                `Delete project “${projectName}”? Its chats move to Chats.`,
              )
            )
              return;
            startTransition(async () => {
              try {
                await deleteStudyProject(projectId);
              } catch (error) {
                // The action redirects on success (NEXT_REDIRECT is
                // handled by Next); anything reaching here is real.
                console.error("sidebar: failed to delete project", error);
              }
            });
          }}
        >
          <Trash2 className="size-4" />
          Delete project
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function StudyChatTree({ study }: { study: SidebarStudy }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = pathname === "/study" ? searchParams.get("t") : null;

  return (
    <div className="space-y-4">
      <div className={navRowClass(pathname === "/study" && !activeId)}>
        <Link href="/study" className="flex min-w-0 flex-1 items-center gap-2.5">
          <MessageCircle className="size-4 shrink-0" />
          Chat
        </Link>
      </div>

      {study.pinned.length > 0 && (
        <div>
          <SectionLabel>Pinned</SectionLabel>
          <div className="space-y-0.5">
            {study.pinned.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                active={thread.id === activeId}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between pr-1">
          <SectionLabel>Projects</SectionLabel>
          <NewProjectDialog>
            <button
              type="button"
              aria-label="New project"
              title="New project"
              className="mb-1.5 flex size-6 shrink-0 items-center justify-center rounded text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <Plus className="size-3.5" />
            </button>
          </NewProjectDialog>
        </div>
        <div className="space-y-0.5">
          {study.projects.map((project) => {
            const onProjectPage = pathname === `/study/project/${project.id}`;
            return (
              <div
                key={project.id}
                className={cn(
                  "group flex items-center rounded-md pr-1 pl-2.5 transition-colors",
                  onProjectPage ? "bg-accent-soft" : "hover:bg-surface-hover",
                )}
              >
                {/* The label opens the project page — its chats live
                    there, ChatGPT-style, not nested in the sidebar. */}
                <Link
                  href={`/study/project/${project.id}`}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-[0.875rem] font-medium",
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
                    className={rowActionClass}
                  >
                    <SquarePen className="size-3.5" />
                  </button>
                </form>
                <ProjectMenu
                  projectId={project.id}
                  projectName={project.name}
                />
              </div>
            );
          })}
          {study.projects.length === 0 && (
            <NewProjectDialog>
              {/* Distinct accessible name — the section's + is already
                  "New project", and two identical names break strict
                  locators (and screen-reader disambiguation). */}
              <button
                type="button"
                aria-label="Create your first project"
                className="flex w-full items-center gap-2 rounded-md py-1.5 pl-2.5 text-[0.875rem] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
              >
                <Plus className="size-3.5" />
                New project
              </button>
            </NewProjectDialog>
          )}
        </div>
      </div>

      {study.chats.length > 0 && (
        <div>
          <SectionLabel>Chats</SectionLabel>
          <div className="space-y-0.5">
            {study.chats.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                active={thread.id === activeId}
              />
            ))}
          </div>
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
        <div className="mt-4 flex flex-col gap-0.5">
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
        </div>
      </nav>
    </div>
  );
}
