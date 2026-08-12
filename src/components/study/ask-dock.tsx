"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { MessageCirclePlus, Sparkles, X } from "lucide-react";
import {
  createStudyAskThread,
  loadStudyAskThread,
} from "@/lib/actions/study";
import { useAskDock } from "@/stores/use-ask-dock";
import { StudyChat } from "@/components/study/study-chat";

type DockMessages = Awaited<ReturnType<typeof loadStudyAskThread>>["messages"];

/**
 * The CRM-style Ask drawer for the study space: a right-side AI chat
 * available from any learner page (floating button + Ctrl/Cmd+J). It
 * chats in a REAL loose study thread, so the conversation lands in the
 * sidebar's Chats like any other — the dock is just another window onto
 * the same chat system, tools and all (the tutor can CRUD vocabulary
 * from here too).
 *
 * The drawer UNMOUNTS when closed (a hidden StudyChat would shadow the
 * page chat's labels for assistive tech) — on every open the transcript
 * is re-read from the persisted thread, so the conversation survives
 * close/reopen and full reloads alike.
 */
export function AskDock({
  models,
  defaultModel,
}: {
  models: string[];
  defaultModel: string;
}) {
  const pathname = usePathname();
  const { isOpen, threadId, openDock, closeDock, toggleDock, setThreadId } =
    useAskDock();
  const [conversation, setConversation] = React.useState<{
    threadId: string;
    messages: DockMessages;
    /** Bumped per load so StudyChat remounts with fresh initialMessages. */
    epoch: number;
  } | null>(null);
  const [, startTransition] = React.useTransition();

  // (Re)load the transcript each time the dock opens.
  React.useEffect(() => {
    if (!isOpen) return;
    let stale = false;
    loadStudyAskThread(useAskDock.getState().threadId)
      .then(({ id, messages }) => {
        if (stale) return;
        setThreadId(id);
        setConversation((prev) => ({
          threadId: id,
          messages,
          epoch: (prev?.epoch ?? 0) + 1,
        }));
      })
      .catch((error: unknown) => {
        console.error("ask dock: failed to load the conversation", error);
      });
    return () => {
      stale = true;
    };
  }, [isOpen, setThreadId]);

  // Ctrl/Cmd+J toggles from anywhere; Escape closes.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggleDock();
      } else if (e.key === "Escape" && useAskDock.getState().isOpen) {
        closeDock();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleDock, closeDock]);

  const newConversation = () => {
    startTransition(async () => {
      try {
        const { id } = await createStudyAskThread();
        setThreadId(id);
        setConversation((prev) => ({
          threadId: id,
          messages: [],
          epoch: (prev?.epoch ?? 0) + 1,
        }));
      } catch (error) {
        console.error("ask dock: failed to start a new conversation", error);
      }
    });
  };

  // The /chat chat page IS a chat — no floating button there (the
  // hotkey still works everywhere).
  const showLauncher = pathname !== "/chat";

  if (!isOpen) {
    return showLauncher ? (
      <button
        type="button"
        onClick={openDock}
        aria-label="Ask AI"
        title="Ask AI (Ctrl+J)"
        className="fixed right-4 bottom-4 z-40 flex size-11 items-center justify-center rounded-full bg-accent text-white shadow-overlay transition-colors hover:bg-accent-hover lg:right-6 lg:bottom-6"
      >
        <Sparkles className="size-5" />
      </button>
    ) : null;
  }

  return (
    <div
      role="dialog"
      aria-label="Ask AI"
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-surface shadow-overlay sm:w-[26rem]"
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
        <Sparkles className="size-4 text-accent" />
        <span className="text-[0.8125rem] font-semibold tracking-wider text-fg-tertiary uppercase">
          Ask
        </span>
        <span className="ml-1 text-[0.8125rem] text-fg-tertiary">
          — your tutor, anywhere
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={newConversation}
          aria-label="New conversation"
          title="New conversation"
          className="flex size-8 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <MessageCirclePlus className="size-4" />
        </button>
        <button
          type="button"
          onClick={closeDock}
          aria-label="Close Ask"
          title="Close (Esc)"
          className="flex size-8 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>

      {conversation && conversation.threadId === threadId ? (
        <StudyChat
          key={`${conversation.threadId}-${conversation.epoch}`}
          threadId={conversation.threadId}
          language={null}
          initialMessages={conversation.messages}
          models={models}
          defaultModel={defaultModel}
        />
      ) : (
        <p className="px-4 py-6 text-[0.9375rem] text-fg-secondary">
          Opening your conversation…
        </p>
      )}
    </div>
  );
}
