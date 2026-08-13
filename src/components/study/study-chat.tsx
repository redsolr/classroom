"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  CornerDownLeft,
  GitBranch,
  MoreHorizontal,
  Plus,
  Square,
  Volume2,
} from "lucide-react";
import { addStudyVocab, branchStudyThread } from "@/lib/actions/study";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { SelectionAskPill } from "@/components/study/selection-ask-pill";
import { cn } from "@/lib/utils";
import { parseVocabLine, type VocabLine } from "@/lib/vocab-lines";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
};

type CapHit = { cap: number; pro: boolean };

/** BCP-47 hints for read-aloud, keyed by the study-language roster. */
const SPEECH_LANGS: Record<string, string> = {
  French: "fr-FR",
  Japanese: "ja-JP",
  English: "en-US",
  Spanish: "es-ES",
  German: "de-DE",
  Italian: "it-IT",
  Korean: "ko-KR",
  Chinese: "zh-CN",
  Thai: "th-TH",
  Portuguese: "pt-PT",
};

/** A VOCAB line whose filing language is resolved (line's own language
 * first, the chat's default second). */
type ResolvedVocabLine = VocabLine & { language: string };

/**
 * One assistant reply can carry vocabulary suggestions on their own
 * lines (`VOCAB: term — meaning — Language`, the convention set in the
 * tutor prompt — parser shared in lib/vocab-lines.ts). They render as
 * add-to-list chips in ANY chat; a line with no resolvable filing
 * language stays visible as plain text rather than becoming a chip
 * that can't save.
 */
function parseReply(
  content: string,
  chatLanguage: string | null,
): {
  text: string;
  vocab: ResolvedVocabLine[];
} {
  const vocab: ResolvedVocabLine[] = [];
  const kept: string[] = [];
  for (const line of content.split("\n")) {
    const parsed = parseVocabLine(line);
    const language = parsed && (parsed.language ?? chatLanguage);
    if (parsed && language) {
      vocab.push({ ...parsed, language });
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
      // Saved vs still-saving must be distinguishable (disabled alone is
      // ambiguous — the button also disables while the action is in
      // flight, and navigating away then aborts the save).
      title={added ? "Added to your vocabulary" : "Add to your vocabulary"}
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

const messageActionClass =
  "flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg";

function CopyMessageButton({
  copied,
  onCopy,
}: {
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy"
      title="Copy"
      className={messageActionClass}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function StudyChat({
  threadId: initialThreadId,
  language,
  initialMessages,
  models,
  defaultModel,
}: {
  /** Null = a draft chat — the thread is created on the first send
   * (ChatGPT shape) and the URL follows via replaceState. */
  threadId: string | null;
  /** Null = generic chat (no tutor persona, no vocab chips). */
  language: string | null;
  initialMessages: ChatMessage[];
  models: string[];
  defaultModel: string;
}) {
  const router = useRouter();
  const [threadId, setThreadId] = React.useState(initialThreadId);
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [model, setModel] = React.useState(defaultModel);
  const [capHit, setCapHit] = React.useState<CapHit | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [speakingId, setSpeakingId] = React.useState<string | null>(null);
  // False on the server snapshot, real capability on the client — the
  // store never changes, so the subscribe is a no-op.
  const ttsSupported = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    () => "speechSynthesis" in window,
    () => false,
  );
  const [, startBranch] = React.useTransition();
  const endRef = React.useRef<HTMLDivElement>(null);
  const transcriptRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  React.useEffect(() => {
    // ChatGPT behavior: the composer is ready to type on desktop. Not on
    // touch — autofocus there pops the keyboard over the conversation.
    if (window.matchMedia("(min-width: 1024px)").matches) {
      textareaRef.current?.focus();
    }
  }, []);

  React.useEffect(() => {
    return () => {
      // Leaving the chat mid-read-aloud must not keep the voice going.
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const send = async () => {
    const message = input.trim();
    if (!message || streaming) return;

    setSendError(null);
    setInput("");
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const localUserId = `local-user-${messages.length}`;
    setMessages((prev) => [
      ...prev,
      { id: localUserId, role: "user", content: message, model: null },
    ]);

    try {
      const res = await fetch("/api/study/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: threadId ?? undefined, message, model }),
        signal: controller.signal,
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

      // First send from a draft: the server just created the thread —
      // adopt it and let the URL follow without a navigation, so the
      // stream keeps rendering in place (ChatGPT behavior).
      const createdThreadId = res.headers.get("X-Study-Thread-Id");
      if (!threadId && createdThreadId) {
        setThreadId(createdThreadId);
        window.history.replaceState(null, "", `/chat?t=${createdThreadId}`);
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
      if (controller.signal.aborted) {
        // The learner hit Stop — the user turn and the partial reply are
        // persisted server-side, so keep them on screen. Refresh syncs
        // thread titles the same way a completed turn does.
        router.refresh();
      } else {
        console.error("study chat: send failed", error);
        setSendError("Something went wrong sending that — please try again.");
        setMessages((prev) => prev.filter((m) => m.id !== localUserId));
        setInput(message);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      textareaRef.current?.focus();
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const copyMessage = (message: ChatMessage, text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedId(message.id);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
      })
      .catch((error: unknown) => {
        console.error("study chat: clipboard write failed", error);
      });
  };

  const readAloud = (message: ChatMessage, text: string) => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    if (speakingId === message.id) {
      setSpeakingId(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const speechLang = language ? SPEECH_LANGS[language] : undefined;
    if (speechLang) utterance.lang = speechLang;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(message.id);
    window.speechSynthesis.speak(utterance);
  };

  const branchAt = (index: number) => {
    // Unreachable in a pristine draft (branch renders on settled replies,
    // and the first reply adopts the created thread) — typed guard.
    if (!threadId) return;
    const id = threadId;
    startBranch(async () => {
      try {
        await branchStudyThread(id, index + 1);
      } catch (error) {
        // The action redirects to the new chat on success (NEXT_REDIRECT
        // is handled by Next itself); anything reaching here is real.
        console.error("study chat: branch failed", error);
      }
    });
  };

  /**
   * Drag-to-ask (ChatGPT's "Ask" on selection): the selected passage
   * lands in the composer as a `>` quote, ready for the follow-up
   * question underneath. Capped so a select-all can't stuff the box.
   */
  const askAboutSelection = (text: string) => {
    const snippet = text.length > 600 ? `${text.slice(0, 600)}…` : text;
    const quoted = snippet
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    setInput((prev) => (prev.trim() ? `${prev}\n${quoted}\n` : `${quoted}\n`));
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: Enter while an IME (Japanese/Chinese/Korean…) is
    // converting must COMMIT the composition, never send the message —
    // the message goes only when the learner sends it themselves.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="study-chat flex min-h-0 flex-1 flex-col">
      {/* The scroll region spans the full pane (scrollbar at the window
          edge); the readable column inside stays capped and centered.
          No empty-state greeting or suggestion chips — a blank screen
          and the composer are the whole invitation (ChatGPT shape). */}
      <div ref={transcriptRef} className="chat-scroll-region min-h-0 flex-1 overflow-y-auto">
        <div className="chat-thread-column mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6">
          {messages.map((m, index) => {
            // The in-flight reply has no persisted row yet — its actions
            // appear when the stream settles (matching ChatGPT).
            const settled = !(streaming && index === messages.length - 1);
            if (m.role === "user") {
              return (
                <div key={m.id} className="chat-user-message group">
                  <div className="chat-user-bubble ml-10 rounded-lg bg-accent-soft px-4 py-2.5 sm:ml-16">
                    <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
                      {m.content}
                    </p>
                  </div>
                  {settled && (
                    <div className="mt-1 flex justify-end opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
                      <CopyMessageButton
                        copied={copiedId === m.id}
                        onCopy={() => copyMessage(m, m.content)}
                      />
                    </div>
                  )}
                </div>
              );
            }
            // Chips work in EVERY chat — each VOCAB line carries its
            // own filing language (chat language as fallback).
            const { text, vocab } = parseReply(m.content, language);
            return (
              <div key={m.id} className="chat-assistant-message group">
                <div className="chat-assistant-bubble mr-10 rounded-lg bg-surface px-4 py-2.5 shadow-card sm:mr-16">
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
                          language={v.language}
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
                {settled && (
                  <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
                    <CopyMessageButton
                      copied={copiedId === m.id}
                      onCopy={() => copyMessage(m, text)}
                    />
                    {ttsSupported && (
                      <button
                        type="button"
                        onClick={() => readAloud(m, text)}
                        aria-label={
                          speakingId === m.id ? "Stop reading" : "Read aloud"
                        }
                        title={
                          speakingId === m.id ? "Stop reading" : "Read aloud"
                        }
                        className={cn(
                          messageActionClass,
                          speakingId === m.id && "text-accent-text",
                        )}
                      >
                        <Volume2 className="size-3.5" />
                      </button>
                    )}
                    <Dropdown>
                      <DropdownTrigger asChild>
                        <button
                          type="button"
                          aria-label="More actions"
                          title="More"
                          className={cn(
                            messageActionClass,
                            "data-[state=open]:text-fg",
                          )}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownTrigger>
                      <DropdownContent align="start" className="w-52">
                        <DropdownItem onSelect={() => branchAt(index)}>
                          <GitBranch className="size-4 text-fg-tertiary" />
                          Branch in new chat
                        </DropdownItem>
                      </DropdownContent>
                    </Dropdown>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>
      <SelectionAskPill containerRef={transcriptRef} onAsk={askAboutSelection} />

      <div className="chat-composer-bar px-4 pt-1 pb-4 sm:px-6">
        <div className="chat-composer-column mx-auto w-full max-w-3xl">
          {capHit && (
            <div className="chat-cap-notice mb-2.5 rounded-md border border-border-strong bg-surface px-3 py-2.5 text-[0.875rem]">
              {capHit.pro ? (
                <span>
                  You&rsquo;ve hit today&rsquo;s practice brake ({capHit.cap}{" "}
                  messages in 24h). It resets on its own — rest your brain! 🌙
                </span>
              ) : (
                <span>
                  You&rsquo;ve used your {capHit.cap} free messages for today.{" "}
                  <Link
                    href="/account"
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
            <p className="chat-send-error mb-2.5 text-[0.875rem] text-danger">
              {sendError}
            </p>
          )}

          {/* ChatGPT-style pill composer: textarea on top, controls below. */}
          <div className="chat-composer rounded-2xl border border-border-strong bg-surface px-3 pt-2.5 pb-2 shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={Math.min(5, Math.max(1, input.split("\n").length))}
              maxLength={4000}
              placeholder={language ? `Practice your ${language}…` : "Ask anything…"}
              aria-label="Message"
              className="chat-composer-input max-h-40 w-full resize-none border-0 bg-transparent text-[0.9375rem] leading-relaxed placeholder:text-fg-tertiary focus:outline-none"
            />
            <div className="chat-composer-controls mt-1 flex items-center justify-between">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                title="Model for the next message"
                aria-label="Model"
                className="chat-model-select h-7 rounded-md bg-transparent px-1 text-[0.8125rem] font-medium text-fg-secondary transition-colors hover:bg-surface-hover focus:outline-none"
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {modelLabel(m)}
                  </option>
                ))}
              </select>
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop"
                  title="Stop generating"
                  className="chat-stop-button flex size-8 items-center justify-center rounded-full bg-accent text-white shadow-sm transition-colors hover:bg-accent-hover"
                >
                  <Square className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={input.trim().length === 0}
                  aria-label="Send"
                  className="chat-send-button flex size-8 items-center justify-center rounded-full bg-accent text-white shadow-sm transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
                >
                  <CornerDownLeft className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
