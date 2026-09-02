import Link from "next/link";
import { format, isSameDay } from "date-fns";
import { Video } from "lucide-react";
import type { ThreadMessage } from "@/lib/message-queries";
import type { MessageRole } from "@/lib/message-guards";
import { cn } from "@/lib/utils";

/**
 * THE THREAD, oldest at the top.
 *
 * Three kinds of row and they read differently on purpose:
 *
 *   · what one of them typed — a bubble, side-picked by author
 *   · what the app did       — a centred line, no bubble, because it is
 *                              not somebody speaking and dressing it as
 *                              one would put words in a tutor's mouth
 *   · the words a message carries — chips under the bubble
 *
 * Day separators rather than a timestamp on every row: in a thread that
 * moves a few times a week, "which day was this" is the question, and a
 * clock beside every line answers a question nobody asked.
 */

function DaySeparator({ at }: { at: Date }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[0.75rem] font-medium text-fg-tertiary">
        {format(at, "EEEE, MMM d")}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function EventRow({ message }: { message: ThreadMessage }) {
  return (
    <div className="my-2 flex flex-col items-center gap-1.5 text-center">
      <p className="max-w-md text-[0.8125rem] text-fg-tertiary">
        {message.body}
      </p>
      {/* The one artifact link that means the same thing to both people.
          Everything else a system message refers to lives behind a
          different URL for each side (the teacher's lesson page, the
          student's token-keyed recap), and a link that is right for one
          reader and wrong for the other is worse than none. */}
      {message.event === "booking_confirmed" && message.lessonId && (
        <Link
          href={`/call/${message.lessonId}`}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-accent-text hover:underline"
        >
          <Video className="size-3.5" />
          Join the lesson
        </Link>
      )}
    </div>
  );
}

function Bubble({
  message,
  mine,
}: {
  message: ThreadMessage;
  mine: boolean;
}) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "message-bubble max-w-[min(36rem,85%)] rounded-2xl px-3.5 py-2.5",
          mine
            ? "bg-accent/25 rounded-br-md"
            : "bg-surface shadow-card rounded-bl-md",
        )}
      >
        <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap">
          {message.body}
        </p>

        {/* The words the message carries — a stamped snapshot, which is
            why they still render for a word the learner has since
            deleted. The message said what it said. */}
        {message.terms.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
            {message.terms.map((term) => (
              <li
                key={term.id}
                className="rounded-md bg-surface-hover px-2 py-1 text-[0.8125rem]"
              >
                <span className="font-medium">{term.term}</span>
                {term.meaning && (
                  <span className="ml-1.5 text-fg-tertiary">{term.meaning}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <p
          className={cn(
            "mt-1 text-[0.6875rem] text-fg-tertiary",
            mine ? "text-right" : "text-left",
          )}
        >
          {format(message.createdAt, "HH:mm")}
        </p>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  role,
}: {
  messages: ThreadMessage[];
  role: MessageRole;
}) {
  return (
    <div className="message-list flex flex-col gap-1.5">
      {messages.map((message, index) => {
        const previous = index > 0 ? messages[index - 1] : null;
        const newDay =
          !previous || !isSameDay(previous.createdAt, message.createdAt);

        return (
          <div key={message.id}>
            {newDay && <DaySeparator at={message.createdAt} />}
            {message.author === "system" ? (
              <EventRow message={message} />
            ) : (
              <Bubble message={message} mine={message.author === role} />
            )}
          </div>
        );
      })}
    </div>
  );
}
