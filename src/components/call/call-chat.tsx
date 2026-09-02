"use client";

import { useEffect, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import { Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallChatMessage } from "@/lib/actions/calls";

/**
 * THE CHAT PANE INSIDE A LESSON.
 *
 * It is a window onto the SAME thread as `/messages` — not an in-call
 * chat that evaporates when the call ends. That is the whole design
 * decision: a spelling, a link, a word written down mid-lesson is
 * exactly the kind of thing a learner wants again on Thursday, and a
 * product that has a messages tab AND a separate call chat has two
 * places to look for one conversation.
 *
 * It opens on what was already said, so the lesson can start from
 * Tuesday's homework question instead of an empty box.
 *
 * WHY NOT `components/messages/message-list.tsx`: that renders the
 * database row (with its events, its word chips and its links to
 * artifacts each side reaches by a different URL). This pane also has to
 * render a message that arrived over the wire a moment ago, where there
 * is no row — so it takes the small shape both sources can produce. The
 * thread is shared; the layout is not, because a side panel during a
 * lesson wants one column of short lines and nothing to click.
 */

export function CallChat({
  open,
  onClose,
  messages,
  selfRole,
  otherName,
  onSend,
  sending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  messages: CallChatMessage[];
  selfRole: "teacher" | "student";
  otherName: string;
  onSend: (body: string) => void;
  sending: boolean;
  error: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  // Follow the conversation. `messages.length` rather than the array, so
  // this fires when a line arrives and not on every parent render.
  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ block: "end" });
  }, [open, messages.length]);

  if (!open) return null;

  const submit = () => {
    const body = draft.trim();
    if (!body || sending) return;
    onSend(body);
    setDraft("");
  };

  return (
    <aside
      // Full height on the right at lg, a bottom sheet on a phone — the
      // same split the rest of the app uses for a panel that must not
      // cover the thing it is about. Half the screen of a video call is
      // the other person's face.
      className={cn(
        "absolute z-20 flex flex-col bg-surface text-fg shadow-card",
        "inset-x-0 bottom-0 h-[60vh] rounded-t-2xl",
        "lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:w-[380px] lg:rounded-none",
      )}
      aria-label={`Messages with ${otherName}`}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{otherName}</p>
          <p className="text-xs text-fg-tertiary">
            Saved to your messages — you can both read this later
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close messages"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-surface-hover"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {messages.length === 0 ? (
          <p className="mt-6 text-center text-sm text-fg-tertiary">
            Nothing here yet. Anything you type stays in your messages after
            the lesson.
          </p>
        ) : (
          messages.map((message, index) => (
            <Row
              key={message.id}
              message={message}
              previous={messages[index - 1]}
              selfRole={selfRole}
            />
          ))
        )}
        <div ref={bottom} />
      </div>

      {error ? (
        <p className="px-4 pb-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-3"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // IME: Enter both commits a candidate and would send, which
          // cuts a Japanese word in half and sends the front of it. Every
          // Enter handler in this app guards composition the same way.
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !composing && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Message"
          aria-label="Message"
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          aria-label="Send"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}

function Row({
  message,
  previous,
  selfRole,
}: {
  message: CallChatMessage;
  previous?: CallChatMessage;
  selfRole: "teacher" | "student";
}) {
  const at = new Date(message.createdAt);
  const newDay = !previous || !isSameDay(new Date(previous.createdAt), at);

  // What the app did, not what somebody said — centred and unbubbled, so
  // it never reads as one of them speaking.
  if (message.author === "system") {
    return (
      <>
        {newDay ? <DayLine at={at} /> : null}
        <p className="my-2 text-center text-xs text-fg-tertiary">
          {message.body}
        </p>
      </>
    );
  }

  const mine = message.author === selfRole;
  return (
    <>
      {newDay ? <DayLine at={at} /> : null}
      <div className={cn("my-1.5 flex", mine ? "justify-end" : "justify-start")}>
        <p
          className={cn(
            "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
            mine
              ? "rounded-br-sm bg-accent text-white"
              : "rounded-bl-sm bg-surface-hover text-fg",
          )}
        >
          {message.body}
        </p>
      </div>
    </>
  );
}

function DayLine({ at }: { at: Date }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[0.7rem] font-medium text-fg-tertiary">
        {format(at, "EEEE, MMM d")}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
