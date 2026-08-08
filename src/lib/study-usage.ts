import { and, count, eq, gte, sql } from "drizzle-orm";
import { db, studyMessages } from "@/db";

/**
 * Rolling-24h tutor-message count for a learner — THE number the daily
 * cap gates on. One definition so the chat route's enforcement and the
 * account page's usage meter can never drift apart.
 */
export async function countTutorMessagesLast24h(
  learnerId: string,
): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(studyMessages)
    .where(
      and(
        eq(studyMessages.learnerId, learnerId),
        eq(studyMessages.role, "user"),
        gte(studyMessages.createdAt, sql`now() - interval '24 hours'`),
      ),
    );
  return value;
}
