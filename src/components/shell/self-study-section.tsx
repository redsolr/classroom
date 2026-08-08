"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpenCheck,
  ChevronDown,
  ChevronRight,
  Folder,
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
import type { SidebarThread } from "@/lib/study-sidebar";
import { cn } from "@/lib/utils";

/**
 * The SELF-STUDY sidebar section — ChatGPT-shaped chat tree:
 *
 *   Chat            ▾
 *     Pinned
 *       <pinned chats>
 *     <language folders ("projects")>  [+ new chat in that language]
 *       <chat history>
 *   Vocabulary / Review / Plan & usage
 *
 * Rendered by both the teacher and student sidebars so the section can
 * never drift between roles.
 */

const STATIC_ITEMS = [
  { href: "/study/vocab", label: "Vocabulary", icon: Layers, exact: true },
  { href: "/study/vocab/review", label: "Review", icon: BookOpenCheck },
  { href: "/study/account", label: "Plan & usage", icon: Gauge },
];

const rowClass = (active: boolean) =>
  cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.9375rem] font-medium transition-colors",
    active
      ? "bg-accent-soft text-accent-text"
      : "text-fg hover:bg-surface-hover",
  );

function threadLabel(thread: SidebarThread): string {
  return thread.title ?? `${thread.language} chat`;
}

function ThreadRow({
  thread,
  active,
  className,
}: {
  thread: SidebarThread;
  active: boolean;
  className?: string;
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
        className,
      )}
    >
      <Link
        href={`/study?t=${thread.id}`}
        className={cn(
          "min-w-0 flex-1 truncate py-1.5 pr-1 text-[0.875rem]",
          active ? "text-accent-text" : "text-fg",
        )}
      >
        {threadLabel(thread)}
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

function StudyChatTree({ threads }: { threads: SidebarThread[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = pathname === "/study" ? searchParams.get("t") : null;

  const [open, setOpen] = React.useState(true);
  const [closedFolders, setClosedFolders] = React.useState<Set<string>>(
    () => new Set(),
  );

  const pinned = threads.filter((thread) => thread.pinned);
  const byLanguage = new Map<string, SidebarThread[]>();
  for (const thread of threads) {
    if (thread.pinned) continue;
    const list = byLanguage.get(thread.language) ?? [];
    list.push(thread);
    byLanguage.set(thread.language, list);
  }

  const toggleFolder = (language: string) => {
    setClosedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(language)) next.delete(language);
      else next.add(language);
      return next;
    });
  };

  return (
    <div>
      <div className={cn(rowClass(pathname === "/study" && !activeId), "pr-1")}>
        <Link
          href="/study"
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <MessageCircle className="size-4 shrink-0" />
          Chat
        </Link>
        {threads.length > 0 && (
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

      {open && threads.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {pinned.length > 0 && (
            <div className="ml-[1.35rem] border-l border-border pl-1.5">
              <p className="px-2.5 pt-1 text-[0.72rem] font-semibold tracking-wider text-fg-tertiary uppercase">
                Pinned
              </p>
              {pinned.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  active={thread.id === activeId}
                />
              ))}
            </div>
          )}

          {[...byLanguage.entries()].map(([language, list]) => {
            const folderOpen = !closedFolders.has(language);
            return (
              <div key={language}>
                <div className="group flex items-center rounded-md pl-4 pr-1 transition-colors hover:bg-surface-hover">
                  <button
                    type="button"
                    onClick={() => toggleFolder(language)}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-[0.875rem] font-medium text-fg"
                  >
                    {folderOpen ? (
                      <ChevronDown className="size-3.5 shrink-0 text-fg-tertiary" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 text-fg-tertiary" />
                    )}
                    <Folder className="size-3.5 shrink-0 text-fg-tertiary" />
                    <span className="truncate">{language}</span>
                  </button>
                  <form action={createStudyThread}>
                    <input type="hidden" name="language" value={language} />
                    <button
                      type="submit"
                      aria-label={`Start ${language} chat`}
                      title={`Start a new ${language} chat`}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-fg-tertiary opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </form>
                </div>
                {/* Children nest under the folder LABEL on a guide rail —
                    a flat shallower indent read as mis-alignment. */}
                {folderOpen && (
                  <div className="ml-[1.35rem] border-l border-border pl-1.5">
                    {list.map((thread) => (
                      <ThreadRow
                        key={thread.id}
                        thread={thread}
                        active={thread.id === activeId}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SelfStudySection({ threads }: { threads: SidebarThread[] }) {
  const pathname = usePathname();
  return (
    <div className="mb-5">
      <p className="mb-1.5 px-2.5 text-[0.72rem] font-semibold tracking-wider text-fg-tertiary uppercase">
        Self-study
      </p>
      <nav className="flex flex-col gap-0.5">
        {/* useSearchParams lives below this Suspense boundary. */}
        <React.Suspense fallback={null}>
          <StudyChatTree threads={threads} />
        </React.Suspense>
        {STATIC_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={rowClass(active)}>
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
