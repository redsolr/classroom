"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CornerDownLeft, Plus, Sparkles } from "lucide-react";
import { addStudyVocab } from "@/lib/actions/study";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
};

type CapHit = { cap: number; pro: boolean };

/**
 * One assistant reply can carry vocabulary suggestions on their own
 * lines (`VOCAB: term — meaning`, the convention set in the tutor
 * prompt). They render as add-to-list chips; the rest renders as text.
 */
function parseReply(content: string): {
  text: string;
  vocab: { term: string; meaning: string }[];
} {
  const vocab: { term: string; meaning: string }[] = [];
  const kept: string[] = [];
  for (const line of content.split("\n")) {
    const match = /^\s*VOCAB:\s*(.+?)\s*[—–-]\s*(.+)\s*$/.exec(line);
    if (match) {
      vocab.push({ term: match[1], meaning: match[2] });
    } else {
      kept.push(line);
    }
  }
  return { text: kept.join("\n").trim(), vocab };
}

function VocabChip({
  term,
  meaning,
  language,
}: {
  term: string;
  meaning: string;
  language: string;
}) {
  const [added, setAdded] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const add = () => {
    startTransition(async () => {
      const data = new FormData();
      data.set("language", language);
      data.set("term", term);
      data.set("meaning", meaning);
      try {
        await addStudyVocab(data);
        setAdded(true);
      } catch (error) {
        console.error("study chat: failed to add vocab from chip", error);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={add}
      disabled={added || pending}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.8125rem] transition-colors",
        added
          ? "border-transparent bg-accent-soft text-accent-text"
          : "border-border-strong bg-surface hover:bg-surface-hover",
      )}
    >
      {added ? (
        <Check className="size-3.5 shrink-0" />
      ) : (
        <Plus className="size-3.5 shrink-0" />
      )}
      <span className="truncate">
        <span className="font-medium">{term}</span> — {meaning}
      </span>
    </button>
  );
}

/** "gpt-5.6-terra" → "Terra" — raw id when the pattern doesn't fit. */
function modelLabel(model: string): string {
  const tail = model.split("-").at(-1) ?? model;
  return tail.length > 2 ? tail[0].toUpperCase() + tail.slice(1) : model;
}

export function StudyChat({
  threadId,
  language,
  learnerName,
  initialMessages,
  models,
  defaultModel,
}: {
  threadId: string;
  language: string;
  learnerName: string | null;
  initialMessages: ChatMessage[];
  models: string[];
  defaultModel: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [model, setModel] = React.useState(defaultModel);
  const [capHit, setCapHit] = React.useState<CapHit | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = async () => {
    const message = input.trim();
    if (!message || streaming) return;

    setSendError(null);
    setInput("");
    setStreaming(true);
    const localUserId = `local-user-${messages.length}`;
    setMessages((prev) => [
      ...prev,
      { id: localUserId, role: "user", content: message, model: null },
    ]);

    try {
      const res = await fetch("/api/study/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message, model }),
      });

      if (res.status === 429) {
        const body = (await res.json()) as CapHit & { error: string };
        setCapHit({ cap: body.cap, pro: body.pro });
        // The server rejected before persisting — undo the optimistic
        // turn and give the text back.
        setMessages((prev) => prev.filter((m) => m.id !== localUserId));
        setInput(message);
        return;
      }
      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed (${res.status})`);
      }

      const repliedModel = res.headers.get("X-Study-Model");
      const assistantId = `local-assistant-${messages.length}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", model: repliedModel },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const delta = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m,
          ),
        );
      }
      // Refresh server components (thread titles) without touching state.
      router.refresh();
    } catch (error) {
      console.error("study chat: send failed", error);
      setSendError("Something went wrong sending that — please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== localUserId));
      setInput(message);
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.length === 0 && (
          <div className="rounded-lg bg-surface px-4 py-4 shadow-card">
            <p className="flex items-start gap-2.5 text-[0.9375rem] leading-relaxed">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                {learnerName ? `Hi ${learnerName}! ` : "Hi! "}I&rsquo;m your{" "}
                {language} tutor. Chat with me in any language — I&rsquo;ll
                correct you gently, practice your vocabulary with you, and
                suggest words worth saving.
              </span>
            </p>
          </div>
        )}

        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="ml-10 rounded-lg bg-accent-soft px-4 py-2.5 sm:ml-16">
                <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
                  {m.content}
                </p>
              </div>
            );
          }
          const { text, vocab } = parseReply(m.content);
          return (
            <div key={m.id} className="mr-10 rounded-lg bg-surface px-4 py-2.5 shadow-card sm:mr-16">
              <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
                {text || (streaming ? "…" : "")}
              </p>
              {vocab.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {vocab.map((v) => (
                    <VocabChip
                      key={`${m.id}-${v.term}`}
                      term={v.term}
                      meaning={v.meaning}
                      language={language}
                    />
                  ))}
                </div>
              )}
              {m.model && m.model !== "mock" && (
                <p className="mt-1.5 text-[0.72rem] text-fg-tertiary">
                  {m.model}
                </p>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border bg-bg px-4 py-3 sm:px-6">
        {capHit && (
          <div className="mb-2.5 rounded-md border border-border-strong bg-surface px-3 py-2.5 text-[0.875rem]">
            {capHit.pro ? (
              <span>
                You&rsquo;ve hit today&rsquo;s practice brake ({capHit.cap}{" "}
                messages in 24h). It resets on its own — rest your brain! 🌙
              </span>
            ) : (
              <span>
                You&rsquo;ve used your {capHit.cap} free messages for today.{" "}
                <Link
                  href="/study/account"
                  className="font-medium text-accent-text underline underline-offset-2"
                >
                  Upgrade to keep practicing
                </Link>
                .
              </span>
            )}
          </div>
        )}
        {sendError && (
          <p className="mb-2.5 text-[0.875rem] text-danger">{sendError}</p>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={Math.min(4, Math.max(1, input.split("\n").length))}
            maxLength={4000}
            placeholder={`Practice your ${language}…`}
            aria-label="Message"
            className="max-h-40 w-full flex-1 resize-none rounded-md border border-border-strong bg-surface px-3 py-2 text-[0.9375rem] leading-relaxed placeholder:text-fg-tertiary focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          />
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            title="Model for the next message"
            aria-label="Model"
            className="h-9 shrink-0 rounded-md border border-border-strong bg-surface px-2 text-[0.8125rem] font-medium text-fg-secondary transition-colors hover:bg-surface-hover focus:border-accent focus:outline-none"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {modelLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void send()}
            disabled={streaming || input.trim().length === 0}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-transparent bg-accent px-3 text-[0.875rem] font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50"
          >
            <CornerDownLeft className="size-3.5" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
