"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import {
  deleteStudyThread,
  moveStudyThreadToProject,
  toggleStudyThreadPin,
} from "@/lib/actions/threads";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { ExtractVocabDialog } from "@/components/study/extract-vocab-dialog";
import {
  MoveToProjectMenu,
  type ProjectOption,
} from "@/components/study/move-to-project-menu";

/**
 * The chat header's single ⋯ menu (ChatGPT-shaped chrome: the header
 * carries the title and one options button, nothing else). Pinning,
 * vocabulary extraction, and chat deletion live here — project chats
 * aren't listed in the sidebar, so the header is their only menu.
 */
export function ChatMenu({
  threadId,
  pinned,
  canExtract,
  projectId,
  projects,
}: {
  threadId: string;
  pinned: boolean;
  /** Extraction needs a conversation to read. */
  canExtract: boolean;
  projectId: string | null;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [extractOpen, setExtractOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const togglePin = () => {
    startTransition(async () => {
      try {
        await toggleStudyThreadPin(threadId);
        router.refresh();
      } catch (error) {
        console.error("study chat: failed to toggle pin", error);
      }
    });
  };

  const deleteChat = () => {
    if (!window.confirm("Delete this chat and its messages?")) return;
    startTransition(async () => {
      try {
        await deleteStudyThread(threadId);
        router.push("/chat");
      } catch (error) {
        console.error("study chat: failed to delete thread", error);
        router.refresh();
      }
    });
  };

  const moveToProject = (targetId: string | null) => {
    startTransition(async () => {
      try {
        await moveStudyThreadToProject(threadId, targetId);
        // Stay in the chat — the header subtitle re-reads the project.
        router.refresh();
      } catch (error) {
        console.error("study chat: failed to move thread", error);
      }
    });
  };

  const PinIcon = pinned ? PinOff : Pin;

  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label="Chat options"
            title="Chat options"
            className="flex size-8 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg data-[state=open]:text-fg"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownTrigger>
        <DropdownContent className="w-56">
          <DropdownItem disabled={pending} onSelect={togglePin}>
            <PinIcon className="size-4 text-fg-tertiary" />
            {pinned ? "Unpin chat" : "Pin chat"}
          </DropdownItem>
          {canExtract && (
            <DropdownItem onSelect={() => setExtractOpen(true)}>
              <BookmarkPlus className="size-4 text-fg-tertiary" />
              Save words from this chat
            </DropdownItem>
          )}
          <MoveToProjectMenu
            projects={projects}
            currentProjectId={projectId}
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
            Delete chat
          </DropdownItem>
        </DropdownContent>
      </Dropdown>

      {/* Mounted per open — the dialog scans the conversation on mount. */}
      {extractOpen && (
        <ExtractVocabDialog
          threadId={threadId}
          onOpenChange={(next) => {
            if (!next) setExtractOpen(false);
          }}
        />
      )}
    </>
  );
}
