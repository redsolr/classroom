"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookMarked,
  BookOpenCheck,
  Compass,
  Folder,
  GraduationCap,
  House,
  Layers,
  LibraryBig,
  MessageCircle,
  MessageSquareQuote,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Route,
  Settings,
  Sparkles,
  SquarePen,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { deleteStudyProject } from "@/lib/actions/projects";
import {
  createStudyThread,
  deleteStudyThread,
  moveStudyThreadToProject,
  renameStudyThread,
  toggleStudyThreadPin,
} from "@/lib/actions/threads";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { InlineRenameInput } from "@/components/ui/inline-rename-input";
import {
  MoveToProjectMenu,
  type ProjectOption,
} from "@/components/study/move-to-project-menu";
import { NewProjectDialog } from "@/components/study/new-project-dialog";
import { QuickAddVocabDialog } from "@/components/study/quick-add-vocab-dialog";
import type { SidebarStudy, SidebarThread } from "@/lib/study-sidebar";
import { threadTitle } from "@/lib/study-display";
import {
  isNavEntryActive,
  navRowClass,
  SectionLabel,
} from "@/components/shell/sidebar-shell";
import { cn } from "@/lib/utils";

/**
 * The self-study sidebar — ChatGPT-shaped, bare tabs (no section
 * heading, like ChatGPT's own top cluster):
 *
 *   New chat                  (→ /chat, straight into the composer)
 *   Vocabulary / Review / Curated lists
 *   More…                     expander for the long tail (Library,
 *                             Notes) so the tab list stays short
 *   Pinned                    chat rows (any chat the learner pinned)
 *   Projects              +   folder rows → the project page (its chats
 *                             live THERE, like ChatGPT); hover: new chat
 *                             in project + ⋯ (settings / delete)
 *   Chats                     loose chats; every chat row gets a ⋯ menu
 *                             (pin / rename inline / delete)
 *
 * Plan & usage moved to the footer account menu (it's settings, not
 * navigation).
 */

/**
 * One word, one meaning (2026-08-29 naming pass):
 *
 *   Books        — collections of words: yours, or ours (Official tab).
 *   Decks        — the Anki-style drill over them.
 *   Reading list — things you've read. No longer "Library", which made
 *                  "book" mean two different things in one sidebar.
 *
 * "Curated lists" is gone as a DESTINATION: official content is the main
 * draw, so it lives as a tab inside the section it belongs to instead of
 * a separate nav item people have to go find. "Dictionary" is gone too —
 * it was a third synonym for Vocabulary / All words.
 */
const PRIMARY_ITEMS = [
  // The guided order comes FIRST, above the places you keep things: it
  // is the only row that answers "what should I learn", and a learner
  // who needs that answer will not find it four rows down.
  { href: "/path", label: "Learning path", icon: Route, exact: false },
  { href: "/books", label: "Books", icon: Layers, exact: true },
  { href: "/decks", label: "Decks", icon: BookOpenCheck, exact: false },
  // The SECOND card type gets its own row, not a filter inside Decks:
  // "what does this word mean" and "can I still supply it when a
  // sentence needs it" are different sessions, and the learner chooses
  // between them before anything else.
  {
    href: "/sentences",
    label: "Sentences",
    icon: MessageSquareQuote,
    exact: false,
  },
  // ONE row, not an expanded list of every title: the covers do the
  // selling on the Books page itself, and nine text rows here would just
  // compete with the learner's own books for attention.
  { href: "/official", label: "Official", icon: Sparkles, exact: false },
];

const MORE_ITEMS = [
  // Progress and Tutors are real destinations, but not DAILY ones: you
  // check whether it's working every few weeks, and you book a human
  // when you decide to. Putting them in the top cluster would push the
  // things people open every morning further down for no gain.
  { href: "/progress", label: "Progress", icon: TrendingUp, exact: false },
  { href: "/tutors", label: "Tutors", icon: GraduationCap, exact: false },
  { href: "/browse", label: "Browse", icon: Compass, exact: false },
  { href: "/reading", label: "Reading list", icon: LibraryBig, exact: false },
  { href: "/notes", label: "Notes", icon: NotebookPen, exact: false },
];

/** Hover-reveal on desktop; always visible on touch (no hover). */
const rowActionClass =
  "flex size-6 shrink-0 items-center justify-center rounded text-fg-tertiary transition-opacity hover:text-fg opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100 data-[state=open]:opacity-100 data-[state=open]:text-fg";

function ThreadRow({
  thread,
  active,
  projects,
}: {
  thread: SidebarThread;
  active: boolean;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [renaming, setRenaming] = React.useState(false);

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

  const commitRename = (next: string) => {
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

  const moveToProject = (projectId: string | null) => {
    startTransition(async () => {
      try {
        await moveStudyThreadToProject(thread.id, projectId);
        router.refresh();
      } catch (error) {
        console.error("sidebar: failed to move thread", error);
      }
    });
  };

  if (renaming) {
    return (
      <div className="chat-row-rename flex items-center gap-2 rounded-md py-1 pl-2.5">
        <MessageCircle className="size-3.5 shrink-0 text-fg-tertiary" />
        <InlineRenameInput
          initialValue={title}
          ariaLabel="Rename chat"
          maxLength={120}
          onCommit={commitRename}
          onClose={() => setRenaming(false)}
          className="w-full min-w-0 text-[0.9375rem]"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "chat-row group flex items-center rounded-md pr-1 pl-2.5 transition-colors",
        active ? "bg-accent/25" : "hover:bg-surface-hover",
      )}
    >
      <Link
        href={`/chat?t=${thread.id}`}
        className={cn(
          // Same type size as the nav rows — the tree must not read as
          // a second, smaller font tier.
          "flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-[0.9375rem]",
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
          <DropdownItem disabled={pending} onSelect={() => setRenaming(true)}>
            <Pencil className="size-4 text-fg-tertiary" />
            Rename
          </DropdownItem>
          <MoveToProjectMenu
            projects={projects}
            currentProjectId={thread.projectId}
            disabled={pending}
            onMove={moveToProject}
          />
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
          <Link href={`/project/${projectId}`}>
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
  const activeId = pathname === "/chat" ? searchParams.get("t") : null;

  // A tab inside More keeps the expander open (its active row must stay
  // visible); otherwise the learner toggles it.
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreActive = MORE_ITEMS.some((item) =>
    isNavEntryActive(pathname, item),
  );
  const showMore = moreOpen || moreActive;

  const navTab = (item: (typeof PRIMARY_ITEMS)[number]) => (
    <Link
      key={item.href}
      href={item.href}
      className={navRowClass(isNavEntryActive(pathname, item))}
    >
      <item.icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );

  return (
    <div className="study-nav space-y-4">
      <div className="study-nav-tabs flex flex-col gap-0.5">
        {/* Home sits ABOVE New chat: it answers "what should I do now",
            which comes before "what do I want to say". */}
        <Link
          href="/home"
          className={cn(
            navRowClass(pathname === "/home"),
            "study-nav-home",
          )}
        >
          <House className="size-4 shrink-0" />
          Home
        </Link>
        <div className={navRowClass(pathname === "/chat" && !activeId)}>
          <Link
            href="/chat"
            className="study-nav-new-chat flex min-w-0 flex-1 items-center gap-2.5"
          >
            <SquarePen className="size-4 shrink-0" />
            New chat
          </Link>
        </div>
        {PRIMARY_ITEMS.map(navTab)}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={showMore}
          className={cn(navRowClass(false), "study-nav-more w-full text-left")}
        >
          <MoreHorizontal className="size-4" />
          More
        </button>
        {showMore && MORE_ITEMS.map(navTab)}
      </div>

      {(study.pinned.length > 0 || study.pinnedDecks.length > 0) && (
        <div>
          <SectionLabel>Pinned</SectionLabel>
          <div className="space-y-0.5">
            {study.pinned.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                active={thread.id === activeId}
                projects={study.projects}
              />
            ))}
            {/* Pinned vocabulary BOOKS — name opens the book, + adds a
                word straight into it from anywhere. */}
            {study.pinnedDecks.map((book) => (
              <div
                key={book.id}
                className="book-row group flex items-center rounded-md pr-1 pl-2.5 transition-colors hover:bg-surface-hover"
              >
                <Link
                  href={`/decks/${book.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-[0.9375rem] text-fg"
                >
                  <BookMarked className="size-3.5 shrink-0 text-fg-tertiary" />
                  <span className="truncate">{book.name}</span>
                  <span className="text-[0.78rem] text-fg-tertiary">
                    {book.wordCount}
                  </span>
                </Link>
                <QuickAddVocabDialog bookId={book.id} bookName={book.name}>
                  <button
                    type="button"
                    aria-label={`Add word to ${book.name}`}
                    title={`Add a word to ${book.name}`}
                    className={rowActionClass}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </QuickAddVocabDialog>
              </div>
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
            const onProjectPage = pathname === `/project/${project.id}`;
            return (
              <div
                key={project.id}
                className={cn(
                  "project-row group flex items-center rounded-md pr-1 pl-2.5 transition-colors",
                  onProjectPage ? "bg-accent/25" : "hover:bg-surface-hover",
                )}
              >
                {/* The label opens the project page — its chats live
                    there, ChatGPT-style, not nested in the sidebar. */}
                <Link
                  href={`/project/${project.id}`}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-[0.9375rem] font-medium",
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
                className="project-row-empty flex w-full items-center gap-2 rounded-md py-1.5 pl-2.5 text-[0.9375rem] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
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
                projects={study.projects}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SelfStudySection({ study }: { study: SidebarStudy }) {
  return (
    <div className="mb-5">
      <nav className="flex flex-col gap-0.5">
        {/* useSearchParams lives below this Suspense boundary. */}
        <React.Suspense fallback={null}>
          <StudyChatTree study={study} />
        </React.Suspense>
      </nav>
    </div>
  );
}
