import "server-only";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  messageTerms,
  messageThreads,
  messages,
  students,
  teachers,
  type Message,
  type MessageTerm,
} from "@/db";
import {
  studentRowsFor,
  type Caller,
  type MessageRole,
  type ThreadParticipant,
} from "@/lib/message-guards";

/**
 * READING the threads — the inbox, one thread, and the badge.
 *
 * One person is routinely BOTH sides: the founder teaches, studies, and
 * is somebody's student. So the inbox is not "my students" or "my
 * tutors" — it is every thread this account is a party to, with the role
 * carried per row. Two lists would be a navigation problem invented by
 * the data model.
 */

export type ThreadSummary = {
  id: string;
  role: MessageRole;
  /** The person on the other end, named as this side should see them. */
  otherName: string;
  studentId: string;
  lastMessageAt: Date | null;
  preview: string | null;
  unread: number;
};

export type ThreadMessage = Message & { terms: MessageTerm[] };

/**
 * Unread, preview and count for a set of threads the caller holds ONE
 * role in.
 *
 * Unread is derived, never stored: everything after my side's read
 * timestamp that I did not write myself. A stored counter has to be
 * maintained by every writer and is wrong the first time one forgets;
 * this cannot drift because there is nothing to keep in step.
 *
 * `array_agg(... order by ...)` gets the newest body in the same pass as
 * the count rather than in a second round trip per thread.
 */
async function summarise(
  threadIds: string[],
  role: MessageRole,
): Promise<Map<string, { unread: number; preview: string | null }>> {
  const out = new Map<string, { unread: number; preview: string | null }>();
  if (threadIds.length === 0) return out;

  const readAt =
    role === "teacher" ? messageThreads.teacherReadAt : messageThreads.studentReadAt;

  const rows = await db
    .select({
      threadId: messages.threadId,
      unread: sql<number>`count(*) filter (
        where ${messages.author} <> ${role}::message_author
          and ${messages.createdAt} > coalesce(${readAt}, to_timestamp(0))
      )::int`,
      preview: sql<
        string | null
      >`(array_agg(${messages.body} order by ${messages.createdAt} desc))[1]`,
    })
    .from(messages)
    .innerJoin(messageThreads, eq(messageThreads.id, messages.threadId))
    .where(inArray(messages.threadId, threadIds))
    .groupBy(messages.threadId);

  for (const row of rows) {
    out.set(row.threadId, { unread: row.unread, preview: row.preview });
  }
  return out;
}

/** Every thread this account is a party to, newest activity first. */
export async function inboxFor(caller: Caller): Promise<ThreadSummary[]> {
  const [teacher, studentRows] = await Promise.all([
    db.query.teachers.findFirst({
      where: eq(teachers.workosUserId, caller.workosUserId),
    }),
    studentRowsFor(caller),
  ]);

  const [asTeacher, asStudent] = await Promise.all([
    teacher
      ? db
          .select({
            id: messageThreads.id,
            studentId: messageThreads.studentId,
            lastMessageAt: messageThreads.lastMessageAt,
            otherName: students.name,
          })
          .from(messageThreads)
          .innerJoin(students, eq(students.id, messageThreads.studentId))
          .where(eq(messageThreads.teacherId, teacher.id))
      : Promise.resolve([]),
    studentRows.length > 0
      ? db
          .select({
            id: messageThreads.id,
            studentId: messageThreads.studentId,
            lastMessageAt: messageThreads.lastMessageAt,
            otherName: sql<string>`coalesce(${teachers.name}, ${teachers.email})`,
          })
          .from(messageThreads)
          .innerJoin(teachers, eq(teachers.id, messageThreads.teacherId))
          .where(
            inArray(
              messageThreads.studentId,
              studentRows.map((s) => s.id),
            ),
          )
      : Promise.resolve([]),
  ]);

  const [teacherSummaries, studentSummaries] = await Promise.all([
    summarise(
      asTeacher.map((t) => t.id),
      "teacher",
    ),
    summarise(
      asStudent.map((t) => t.id),
      "student",
    ),
  ]);

  const summaries: ThreadSummary[] = [
    ...asTeacher.map((t) => ({
      ...t,
      role: "teacher" as const,
      unread: teacherSummaries.get(t.id)?.unread ?? 0,
      preview: teacherSummaries.get(t.id)?.preview ?? null,
    })),
    ...asStudent.map((t) => ({
      ...t,
      role: "student" as const,
      unread: studentSummaries.get(t.id)?.unread ?? 0,
      preview: studentSummaries.get(t.id)?.preview ?? null,
    })),
  ];

  // A thread nobody has spoken in yet sorts by when it was opened, which
  // `lastMessageAt` is null for — those go last rather than first.
  return summaries.sort(
    (a, b) =>
      (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0),
  );
}

/**
 * The badge in the sidebar — ONE count, not the inbox.
 *
 * This renders in the LAYOUT, on every page in the app, so it has to be
 * the cheapest read here. The first version called `inboxFor()` and
 * summed — every page load paid for the full inbox (two thread scans,
 * two grouped aggregates with `array_agg` previews) to produce one
 * integer, under a comment claiming it did not. Same definition of
 * unread as `summarise`, applied once across both roles.
 */
export async function unreadCountFor(caller: Caller): Promise<number> {
  const [teacher, studentRows] = await Promise.all([
    db.query.teachers.findFirst({
      where: eq(teachers.workosUserId, caller.workosUserId),
      columns: { id: true },
    }),
    studentRowsFor(caller),
  ]);
  const studentIds = studentRows.map((s) => s.id);
  if (!teacher && studentIds.length === 0) return 0;

  const asTeacher = teacher
    ? and(
        eq(messageThreads.teacherId, teacher.id),
        ne(messages.author, "teacher"),
        sql`${messages.createdAt} > coalesce(${messageThreads.teacherReadAt}, to_timestamp(0))`,
      )
    : undefined;
  const asStudent =
    studentIds.length > 0
      ? and(
          inArray(messageThreads.studentId, studentIds),
          ne(messages.author, "student"),
          sql`${messages.createdAt} > coalesce(${messageThreads.studentReadAt}, to_timestamp(0))`,
        )
      : undefined;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(messageThreads, eq(messageThreads.id, messages.threadId))
    .where(asTeacher && asStudent ? or(asTeacher, asStudent) : (asTeacher ?? asStudent));

  return row?.count ?? 0;
}

/** One thread's messages, oldest first, with any words they carry. */
export async function threadMessages(
  threadId: string,
): Promise<ThreadMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.createdAt));
  if (rows.length === 0) return [];

  const terms = await db
    .select()
    .from(messageTerms)
    .where(
      inArray(
        messageTerms.messageId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(messageTerms.position));

  const byMessage = new Map<string, MessageTerm[]>();
  for (const term of terms) {
    const list = byMessage.get(term.messageId) ?? [];
    list.push(term);
    byMessage.set(term.messageId, list);
  }

  return rows.map((row) => ({ ...row, terms: byMessage.get(row.id) ?? [] }));
}

/** The other side's last activity, for "seen" without a read receipt. */
export function otherSideReadAt(me: ThreadParticipant): Date | null {
  return me.role === "teacher"
    ? me.thread.studentReadAt
    : me.thread.teacherReadAt;
}

/** The newest thread this teacher has with a student, if any exists. */
export async function threadIdForStudent(
  studentId: string,
): Promise<string | null> {
  const row = await db.query.messageThreads.findFirst({
    where: eq(messageThreads.studentId, studentId),
    columns: { id: true },
  });
  return row?.id ?? null;
}

/** Newest first — used by the student page's "recent messages" peek. */
export async function latestMessages(
  threadId: string,
  limit: number,
): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}
