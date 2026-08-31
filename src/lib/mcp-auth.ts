import "server-only";
import { eq } from "drizzle-orm";
import { db, teachers, type Teacher } from "@/db";

/**
 * WHO MAY DRIVE THE APP WITHOUT A BROWSER.
 *
 * The teacher workspace has always assumed a person with a session:
 * adding a student and scheduling a lesson are three clicks, and there
 * was no way to do either from outside a browser. That made an agent —
 * or CI, or a migration script — unable to set up so much as a test
 * lesson, and the workaround was always going to be someone handing over
 * a database URL. This is the door that makes the workaround
 * unnecessary.
 *
 * TWO INDEPENDENT GATES, and both must pass.
 *
 * 1. A static bearer (`CLASSROOM_MCP_TOKEN`) proves the CALLER is
 *    trusted. Absent, the door does not exist — no token, no endpoint.
 * 2. An allowlist (`CLASSROOM_MCP_TEACHER_EMAILS`) says WHICH teachers
 *    it may act as. Absent, the allowlist is empty and every call is
 *    refused.
 *
 * The second gate is the one that matters. A bearer alone would let
 * whoever holds it operate any teacher's roster on the deployment — read
 * a student list, put a lesson on a stranger's calendar. Scoping it to
 * named addresses keeps the blast radius to accounts the operator
 * already controls, and makes widening it a deliberate act with a diff
 * attached.
 *
 * Both fail CLOSED. An unconfigured deployment refuses everything rather
 * than defaulting to "any teacher", which is the failure mode worth
 * engineering against — a forgotten env var should turn the door off,
 * never turn it into a skeleton key.
 */

export class McpAuthError extends Error {}

/** The endpoint exists only where a token has been set. */
export function mcpConfigured(): boolean {
  return Boolean(process.env.CLASSROOM_MCP_TOKEN);
}

/** Constant-time-ish bearer check. */
export function bearerAccepted(bearer: string | undefined): boolean {
  const expected = process.env.CLASSROOM_MCP_TOKEN;
  if (!expected || !bearer) return false;
  if (bearer.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bearer.length; i += 1) {
    diff |= bearer.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** The addresses this token may act as, lowercased. Empty by default. */
export function allowedTeacherEmails(): string[] {
  return (process.env.CLASSROOM_MCP_TEACHER_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Resolve the teacher a tool is asking to act as, or refuse.
 *
 * The teacher must already EXIST — a row is created by signing in, and
 * inventing one here would mean fabricating a WorkOS identity that can
 * never log in to the account it owns.
 */
export async function requireAllowedTeacher(email: string): Promise<Teacher> {
  const wanted = email.trim().toLowerCase();
  if (!allowedTeacherEmails().includes(wanted)) {
    throw new McpAuthError(
      `${email} is not in CLASSROOM_MCP_TEACHER_EMAILS — add it there to let this token act as that teacher`,
    );
  }
  const teacher = await db.query.teachers.findFirst({
    where: eq(teachers.email, wanted),
  });
  if (!teacher) {
    throw new McpAuthError(
      `no teacher account for ${email} — sign in as them once first; a teacher row is created by signing in`,
    );
  }
  return teacher;
}
