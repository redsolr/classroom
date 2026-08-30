import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireLearner } from "@/lib/auth";
import {
  bothConsented,
  ensureCall,
  requireCallParticipant,
  selfConsentAt,
} from "@/lib/call-guards";
import { realtimeKitConfigured } from "@/lib/realtimekit";
import { LessonCallRoom } from "@/components/call/lesson-call-room";

export const metadata: Metadata = { title: "Lesson" };

/**
 * THE LESSON ROOM.
 *
 * Deliberately OUTSIDE the `(study)` group: a call wants the whole
 * screen, and the sidebar and phone tab bar are navigation for a place
 * you are not currently in. Everything else about it — tokens, type,
 * controls — is the same app.
 *
 * The page resolves identity and consent on the server and hands the
 * client only what it needs. The client never decides who someone is or
 * whether recording may start.
 */
export default async function LessonCallPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const caller = await requireLearner();

  let me;
  try {
    me = await requireCallParticipant(caller, lessonId);
  } catch {
    // Not this person's lesson, or no such lesson — the guard gives both
    // the same answer on purpose, and so does this page.
    notFound();
  }

  // Opened on LOAD, not on join: consent comes before joining, and it has
  // to be recorded against a room that exists. Returns null when the
  // provider is unconfigured, which the client renders as a plain
  // explanation rather than a failure at the join button.
  const call = await ensureCall(me);

  return (
    <LessonCallRoom
      lessonId={lessonId}
      role={me.role}
      selfName={me.displayName}
      otherName={
        me.role === "teacher"
          ? me.student.name
          : (me.teacher.name ?? me.teacher.email)
      }
      startsAt={me.lesson.startedAt.toISOString()}
      configured={realtimeKitConfigured()}
      initialSelfConsented={Boolean(call && selfConsentAt(call, me.role))}
      initialBothConsented={Boolean(call && bothConsented(call))}
    />
  );
}
