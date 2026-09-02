"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeKitMeeting } from "@/components/call/realtimekit-client";
import {
  callChatHistory,
  sendCallChatMessage,
  type CallChatMessage,
} from "@/lib/actions/calls";
import { decodeCallChat, encodeCallChat } from "@/lib/call-chat-wire";

/**
 * THE CHAT INSIDE A LESSON, as state and behaviour — no markup.
 *
 * Pulled out of the room component because the room is about the CALL:
 * devices, consent, recording, who is on screen. The chat has its own
 * small life (a pane, an unread count, a wire, a thread) and mixing the
 * two made one file answer two questions. `call-chat.tsx` renders what
 * this returns.
 *
 * Two rules everything here rests on:
 *
 *  - WRITTEN DOWN FIRST, THEN TOLD. The row is stored before anything
 *    goes over the wire. A line the other person saw but which was never
 *    stored is one neither of them can find tomorrow; a line stored but
 *    late is a message.
 *  - THE WIRE CANNOT RELABEL A LINE. A message already held keeps the
 *    author the SERVER gave it; the broadcast copy of the same id is
 *    recognised and dropped. That is what stops one participant's browser
 *    posting as the other in the live pane.
 */
export function useCallChat(args: {
  lessonId: string;
  role: "teacher" | "student";
  otherName: string;
}) {
  const { lessonId, role, otherName } = args;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CallChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read inside SDK callbacks, which close over the state they were
  // registered with. The ref is what lets the wire handler know whether
  // the pane is open NOW rather than when the call started.
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  /** Ids we broadcast ourselves, so our own echo is not read as theirs. */
  const ownSent = useRef<Set<string>>(new Set());
  const meeting = useRef<RealtimeKitMeeting | null>(null);

  /** Add what we did not already have; never overwrite what we did. */
  const merge = useCallback((incoming: CallChatMessage[]) => {
    setMessages((current) => {
      const known = new Set(current.map((m) => m.id));
      const added = incoming.filter((m) => !known.has(m.id));
      if (added.length === 0) return current;
      return sorted([...current, ...added]);
    });
  }, []);

  /** Swap the optimistic copy for the row the server wrote. */
  const settle = useCallback((tempId: string, saved: CallChatMessage | null) => {
    setMessages((current) => {
      const rest = current.filter((m) => m.id !== tempId);
      if (!saved || rest.some((m) => m.id === saved.id)) return rest;
      return sorted([...rest, saved]);
    });
  }, []);

  /**
   * Hook the wire up, once the meeting exists.
   *
   * Anything arriving here is from the other person: there are two
   * people in the room, so direction IS the attribution, and a payload
   * cannot claim to be the other side by saying so.
   */
  const attach = useCallback(
    (m: RealtimeKitMeeting) => {
      meeting.current = m;
      m.chat.on("chatUpdate", ({ action, message }) => {
        if (action !== "add") return;
        const wire = decodeCallChat(message.message);
        if (!wire) return;
        if (ownSent.current.has(wire.id)) return;
        merge([
          {
            id: wire.id,
            author: role === "teacher" ? "student" : "teacher",
            body: wire.body,
            createdAt: wire.createdAt,
          },
        ]);
        if (!openRef.current) setUnread((n) => n + 1);
      });
    },
    [merge, role],
  );

  const openPane = useCallback(async () => {
    setOpen(true);
    setUnread(0);
    try {
      // The thread, not an in-call scratchpad: what was said before the
      // lesson is the context the lesson starts from.
      merge(await callChatHistory(lessonId));
    } catch (e) {
      console.error("lesson call: loading the thread failed", e);
      setError("Could not load your earlier messages.");
    }
  }, [lessonId, merge]);

  const closePane = useCallback(() => setOpen(false), []);

  /**
   * Say it. Shown at once, stored before it is broadcast.
   *
   * The optimistic copy is what makes typing feel like typing rather than
   * like submitting a form; the server's row replaces it the moment it
   * exists. If the broadcast then fails the message is still sent — it
   * is in the thread — and the sender is told plainly it may not have
   * arrived yet, rather than left to assume it did.
   */
  const send = useCallback(
    async (body: string) => {
      const tempId = `pending:${crypto.randomUUID()}`;
      setSending(true);
      setError(null);
      merge([{ id: tempId, author: role, body, createdAt: new Date().toISOString() }]);
      try {
        const saved = await sendCallChatMessage(lessonId, body);
        ownSent.current.add(saved.id);
        settle(tempId, saved);
        try {
          await meeting.current?.chat.sendCustomMessage({
            type: "custom",
            message: encodeCallChat({
              id: saved.id,
              body: saved.body,
              createdAt: saved.createdAt,
            }),
          });
        } catch (e) {
          console.error("lesson call: broadcasting the message failed", e);
          setError(
            `Saved to your messages, but ${otherName} may not see it until after the lesson.`,
          );
        }
      } catch (e) {
        console.error("lesson call: sending a message failed", e);
        settle(tempId, null);
        setError(e instanceof Error ? e.message : "Could not send that message.");
      } finally {
        setSending(false);
      }
    },
    [lessonId, merge, otherName, role, settle],
  );

  return {
    open,
    messages,
    unread,
    sending,
    error,
    attach,
    openPane,
    closePane,
    send,
  };
}

/** ISO timestamps sort as text; every one here is UTC from the server. */
function sorted(messages: CallChatMessage[]): CallChatMessage[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
