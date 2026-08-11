import postgres from "postgres";

function sql() {
  return postgres(
    process.env.DATABASE_URL ??
      "postgresql://classroom:classroom@localhost:5439/classroom",
    { max: 1 },
  );
}

/**
 * Reset the fixed mock-auth learner (cascades to study projects,
 * threads, messages, vocab) — the suite's idempotence guarantee on the
 * persistent local Postgres. Shared by every study spec's beforeAll.
 */
export async function resetMockLearner(): Promise<void> {
  const db = sql();
  try {
    await db`delete from learners where workos_user_id = 'mock_teacher_dev'`;
  } finally {
    await db.end();
  }
}

/**
 * Sweep the mock teacher's accumulated e2e rows — every run creates
 * `E2E Student <runId>` students (cascading lessons/records) and never
 * cleaned them up, until the pile crossed the schedule agenda's 30-row
 * page and this run's own lesson fell off it (2026-08-12 flake).
 * Deleting by the runId-stamped name patterns keeps any hand-made local
 * data intact.
 */
export async function resetMockTeacherE2EData(): Promise<void> {
  const db = sql();
  try {
    await db`
      delete from students
      where teacher_id in
        (select id from teachers where workos_user_id = 'mock_teacher_dev')
        and (name like 'E2E Student %'
          or name like 'Import Maki %'
          or name like 'Import Pedro %')
    `;
  } finally {
    await db.end();
  }
}
