import "server-only";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  db,
  messageTerms,
  messageThreads,
  messages,
  students,
  teachers,
  type Message,
} from "@/db";
import {
  ensureThread,
  studentIsReachable,
  type MessageRole,
} from "@/lib/message-guards";
import { sendPushToUser } from "@/lib/push";

/**
 * THE ONE WRITER for a message, human or system.
 *
 * It lives outside `src/lib/actions/` on purpose — everything exported
 * from there is compiled into a public POST endpoint, and this is called
 * from half a dozen existing actions (homework, recaps, bookings) that
 * have already resolved their own caller.
 *
 * Three things happen in a fixed order, and the order is the design:
 *
 *   1. the row is written, and the thread's `last_message_at` moves;
 *   2. the pages that render it are revalidated;
 *   3. the other person is notified, and a failure there is logged and
 *      swallowed.
 *
 * A message that is stored but not pushed is a late notification. A
 * message that is pushed but not stored does not exist — the person
 * taps it and lands on a thread that never mentions what they were told
 * about. So delivery is always downstream of the write, never a
 * precondition of it.
 */

/** Everywhere a message appears. Per-entity, like `study-revalidate.ts`. */
export function revalidateThread(threadId: string): void {
  // The unread badge lives in the sidebar, which is LAYOUT data — all
  // three authed layouts render it, and a page-only revalidation leaves
  // a badge that is right on the thread and wrong in the rail beside it.
  revalidatePath("/", "layout");
  revalidatePath("/messages");
  revalidatePath(`/messages/${threadId}`);
}

export type MessageEvent = NonNullable<Message["event"]>;

export type PostInput = {
  author: MessageRole | "system";
  body: string;
  event?: MessageEvent;
  homeworkId?: string | null;
  lessonId?: string | null;
  bookingId?: string | null;
  /** Stamped word snapshots — the accountability nudge's payload. */
  terms?: { term: string; meaning: string | null }[];
  /**
   * Who to notify. A human message always notifies the other side, so
   * this is only asked of SYSTEM messages, where the answer genuinely
   * varies: homework assigned is for the student, homework submitted is
   * for the teacher, and neither is guessable from the row.
   */
  notify?: MessageRole | null;
  /**
   * Skip the notification entirely, whoever it would have gone to.
   *
   * One caller: a line typed inside a live lesson. The other person is
   * looking at the same room, so a push would buzz the phone of someone
   * sitting in front of you — and a notification that arrives while you
   * are watching the thing it is about is how people learn to turn
   * notifications off. The message is still written, still in the thread
   * tomorrow, and still marks its author's side read.
   */
  silent?: boolean;
};

/**
 * Write one message into an existing thread.
 *
 * Returns the row so callers that need to attach something to it (the
 * nudge's words) do not have to look it up again.
 */
export async function postMessage(
  threadId: string,
  input: PostInput,
): Promise<Message> {
  const now = new Date();

  const message = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(messages)
      .values({
        threadId,
        author: input.author,
        body: input.body,
        event: input.event ?? null,
        homeworkId: input.homeworkId ?? null,
        lessonId: input.lessonId ?? null,
        bookingId: input.bookingId ?? null,
        createdAt: now,
      })
      .returning();

    if (input.terms?.length) {
      await tx.insert(messageTerms).values(
        input.terms.map((t, position) => ({
          messageId: created.id,
          term: t.term,
          meaning: t.meaning,
          position,
        })),
      );
    }

    await tx
      .update(messageThreads)
      .set({
        lastMessageAt: now,
        updatedAt: now,
        // Writing to someone is reading the thread. Without this the
        // author's own message counts as unread to themselves, and the
        // badge in their sidebar goes up when they hit send.
        //
        // A SYSTEM message reads for the side it is not for, on the same
        // reasoning: "you assigned homework" is not news to the teacher
        // who just assigned it, and a badge that lights up in response to
        // your own action is the fastest way to teach someone to ignore
        // the badge.
        ...(input.author === "teacher" ||
        (input.author === "system" && input.notify === "student")
          ? { teacherReadAt: now }
          : {}),
        ...(input.author === "student" ||
        (input.author === "system" && input.notify === "teacher")
          ? { studentReadAt: now }
          : {}),
      })
      .where(eq(messageThreads.id, threadId));

    return created;
  });

  revalidateThread(threadId);

  const notify = input.silent
    ? null
    : input.author === "system"
      ? (input.notify ?? null)
      : input.author === "teacher"
        ? "student"
        : "teacher";
  if (notify) await notifyThread(threadId, notify, input.body);

  return message;
}

/**
 * Post into the thread for a roster row, opening it if this is the first
 * thing ever said. The entry point for the existing actions — homework,
 * recaps, bookings — which know a student, not a thread.
 *
 * A student nobody can reach gets NOTHING, silently. A hand-typed roster
 * row with no email can never have an account, so a thread for it would
 * be an empty conversation sitting in the teacher's inbox collecting
 * events that only ever had one reader. That is a normal state for a
 * tutor who keeps a couple of students on paper, not an error worth
 * failing an unrelated homework assignment over.
 */
export async function postThreadEventForStudent(
  teacherId: string,
  studentId: string,
  input: PostInput,
): Promise<void> {
  const student = await db.query.students.findFirst({
    where: eq(students.id, studentId),
    columns: { email: true, workosUserId: true },
  });
  if (!student || !studentIsReachable(student)) return;

  const thread = await ensureThread(teacherId, studentId);
  await postMessage(thread.id, input);
}

/**
 * Tell the other person, on whatever browsers they enrolled.
 *
 * Never throws: this runs after a committed write, and a push service
 * having a bad afternoon must not turn a delivered message into an error
 * the sender sees.
 */
async function notifyThread(
  threadId: string,
  recipient: MessageRole,
  body: string,
): Promise<void> {
  try {
    const thread = await db.query.messageThreads.findFirst({
      where: eq(messageThreads.id, threadId),
    });
    if (!thread) return;

    const [teacher, student] = await Promise.all([
      db.query.teachers.findFirst({ where: eq(teachers.id, thread.teacherId) }),
      db.query.students.findFirst({ where: eq(students.id, thread.studentId) }),
    ]);
    if (!teacher || !student) return;

    // An unclaimed student has no account to reach yet — a normal state,
    // not a failure. The message waits for them in the thread.
    const workosUserId =
      recipient === "teacher" ? teacher.workosUserId : student.workosUserId;
    if (!workosUserId) return;

    const from =
      recipient === "teacher" ? student.name : (teacher.name ?? teacher.email);

    await sendPushToUser(workosUserId, {
      title: from,
      // Trimmed rather than sent whole: a notification is a summons, not
      // the message. The rest is one tap away and reads better there.
      body: body.length > 140 ? `${body.slice(0, 139)}…` : body,
      url: `/messages/${threadId}`,
      // One bubble per thread — four lines in a row should replace each
      // other on the lock screen, not stack.
      tag: `thread-${threadId}`,
    });
  } catch (error) {
    console.error(`[messages] notification failed for ${threadId}:`, error);
  }
}
