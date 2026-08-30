import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db, teachers } from "@/db";
import { eq } from "drizzle-orm";
import { requireLearner } from "@/lib/auth";
import {
  bookingLearner,
  bothConsented,
  findCall,
  requireCallParticipant,
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
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const learner = await requireLearner();

  let me;
  try {
    me = await requireCallParticipant(learner, bookingId);
  } catch {
    // Not this person's lesson, or no such booking — the guard gives both
    // the same answer on purpose, and so does this page.
    notFound();
  }

  const [tutor, student] = await Promise.all([
    db.query.teachers.findFirst({
      where: eq(teachers.id, me.booking.teacherId),
    }),
    bookingLearner(me.booking),
  ]);

  const call = await findCall(bookingId);
  const otherName =
    me.role === "teacher"
      ? (student?.name ?? student?.email ?? "Your student")
      : (tutor?.name ?? tutor?.email ?? "Your tutor");

  return (
    <LessonCallRoom
      bookingId={bookingId}
      role={me.role}
      selfName={me.displayName}
      otherName={otherName}
      startsAt={me.booking.startsAt.toISOString()}
      configured={realtimeKitConfigured()}
      initialSelfConsented={Boolean(
        call &&
          (me.role === "teacher" ? call.teacherConsentAt : call.learnerConsentAt),
      )}
      initialBothConsented={Boolean(call && bothConsented(call))}
    />
  );
}
