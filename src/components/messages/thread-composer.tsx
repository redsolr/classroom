"use client";

import * as React from "react";
import { SendHorizontal } from "lucide-react";
import { sendThreadMessage } from "@/lib/actions/messages";

/**
 * The composer.
 *
 * Same interaction as the study chat's — Enter sends, Shift+Enter makes
 * a line, focus returns after a send — because a person types in both
 * and two different rules for the Enter key in one app is a papercut
 * they will hit every day.
 *
 * The nudge arrives here as PREFILLED TEXT, never as an auto-send. The
 * words are the learner's worst five and the sentence is signed by their
 * tutor; a button that fires that off unread would be the app writing in
 * someone else's voice about someone else's failure. The tutor edits it,
 * or deletes it and writes their own.
 */
export function ThreadComposer({
  threadId,
  placeholder,
  prefill,
  attachStrugglingWords = false,
}: {
  threadId: string;
  placeholder: string;
  prefill?: string;
  /** Set with a prefilled nudge: the server re-derives the words from
   * the review log and stamps them onto the message. Nothing about the
   * words themselves travels from here. */
  attachStrugglingWords?: boolean;
}) {
  const [value, setValue] = React.useState(prefill ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  // A prefilled composer that isn't focused is a draft the tutor has to
  // go and find; the caret belongs at the end of the sentence they are
  // about to edit.
  React.useEffect(() => {
    if (!prefill) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [prefill]);

  const submit = React.useCallback(
    async (formData: FormData) => {
      const body = String(formData.get("body") ?? "").trim();
      if (!body || busy) return;
      setBusy(true);
      setError(null);
      try {
        await sendThreadMessage(threadId, formData);
        setValue("");
      } catch (sendError) {
        console.error("[messages] send failed:", sendError);
        // Kept inline rather than routed to the toast layer: something
        // you have to act on does not belong in a message that leaves on
        // a timer, and the thing to act on here is the text still in the
        // box.
        setError("That didn't send. Your message is still here — try again.");
      } finally {
        setBusy(false);
        textareaRef.current?.focus();
      }
    },
    [busy, threadId],
  );

  return (
    <form
      ref={formRef}
      action={submit}
      className="thread-composer border-t border-border bg-bg pt-3"
    >
      {error && (
        <p className="thread-composer-error mb-2 text-[0.875rem] text-danger">
          {error}
        </p>
      )}
      <div className="rounded-2xl border border-border-strong bg-surface px-3 pt-2.5 pb-2 shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <textarea
          ref={textareaRef}
          name="body"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          rows={Math.min(5, Math.max(1, value.split("\n").length))}
          maxLength={4000}
          placeholder={placeholder}
          aria-label="Message"
          className="max-h-40 w-full resize-none border-0 bg-transparent text-[0.9375rem] leading-relaxed placeholder:text-fg-tertiary focus:outline-none"
        />
        {attachStrugglingWords && (
          <input type="hidden" name="attachStrugglingWords" value="on" />
        )}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[0.75rem] text-fg-tertiary">
            {attachStrugglingWords
              ? "The words they miss most will be attached."
              : ""}
          </span>
          <button
            type="submit"
            aria-label="Send"
            title="Send"
            disabled={busy || value.trim().length === 0}
            className="flex size-8 items-center justify-center rounded-full bg-accent text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <SendHorizontal className="size-4" />
          </button>
        </div>
      </div>
    </form>
  );
}
