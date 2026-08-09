import postgres from "postgres";

/**
 * Reset the fixed mock-auth learner (cascades to study projects,
 * threads, messages, vocab) — the suite's idempotence guarantee on the
 * persistent local Postgres. Shared by every study spec's beforeAll.
 */
export async function resetMockLearner(): Promise<void> {
  const sql = postgres(
    process.env.DATABASE_URL ??
      "postgresql://classroom:classroom@localhost:5439/classroom",
    { max: 1 },
  );
  try {
    await sql`delete from learners where workos_user_id = 'mock_teacher_dev'`;
  } finally {
    await sql.end();
  }
}
