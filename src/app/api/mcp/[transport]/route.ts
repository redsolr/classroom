import { createMcpHandler, withMcpAuth } from "mcp-handler";
import * as z from "zod";
import { bearerAccepted, mcpConfigured } from "@/lib/mcp-auth";
import {
  createStudent,
  listLessons,
  listStudents,
  scheduleLesson,
  whoAmI,
} from "@/lib/mcp-tools";

/**
 * MCP SERVER — the agent door to Classroom (public URL `POST /mcp`, a
 * rewrite of `/api/mcp/mcp`; see next.config.ts).
 *
 * Why it exists: every teacher-side operation assumed a person with a
 * browser session, so nothing outside one could set up even a test
 * lesson. The workaround was always going to be handing an agent a
 * production database URL, which is the thing this repo's ops doctrine
 * exists to prevent — operations belong behind an endpoint that
 * validates, scopes and logs them, not behind psql.
 *
 * AUTH is a static bearer only, deliberately narrower than the CRM's
 * door next to it. The CRM is an OAuth 2.1 resource server because
 * humans sign into it from claude.ai; nothing signs into this one but
 * our own automation, and an OAuth server that no user ever uses is
 * surface without a purpose. If a human client ever needs it, the CRM's
 * `mcp-auth.ts` is the pattern to copy — not to reinvent.
 *
 * Closed by default in both directions: no `CLASSROOM_MCP_TOKEN` and the
 * endpoint 401s everything; no `CLASSROOM_MCP_TEACHER_EMAILS` and every
 * tool refuses, because a token that can act as ANY teacher on the
 * deployment is a skeleton key rather than a service credential.
 */

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "whoami",
      {
        description:
          "Which teacher accounts this token may act as, and whether each has signed in yet. Call this first when unsure.",
        inputSchema: z.object({}),
      },
      async () => text(await whoAmI()),
    );

    server.registerTool(
      "list_students",
      {
        description: "The students on a teacher's roster.",
        inputSchema: z.object({
          teacherEmail: z
            .string()
            .describe("The teacher whose roster to read."),
        }),
      },
      async (input) => text(await listStudents(input)),
    );

    server.registerTool(
      "create_student",
      {
        description:
          "Add a student to a teacher's roster. Idempotent on email. Give the email: it is how the learner claims the account and how they are admitted to their own lesson call.",
        inputSchema: z.object({
          teacherEmail: z.string(),
          name: z.string(),
          email: z
            .string()
            .optional()
            .describe("Strongly recommended — required for them to join a call."),
          targetLanguage: z.string().optional(),
        }),
      },
      async (input) => text(await createStudent(input)),
    );

    server.registerTool(
      "schedule_lesson",
      {
        description:
          "Put a lesson on a teacher's calendar with one of their students, and return the call room path. A future startsAt schedules it.",
        inputSchema: z.object({
          teacherEmail: z.string(),
          studentEmail: z.string(),
          startsAt: z
            .string()
            .optional()
            .describe("ISO 8601. Defaults to ten minutes from now."),
          durationMinutes: z.number().optional(),
          title: z.string().optional(),
        }),
      },
      async (input) => text(await scheduleLesson(input)),
    );

    server.registerTool(
      "list_lessons",
      {
        description:
          "A teacher's lessons, newest first, each with the path to its call room.",
        inputSchema: z.object({
          teacherEmail: z.string(),
          limit: z.number().optional(),
        }),
      },
      async (input) => text(await listLessons(input)),
    );
  },
  {
    serverInfo: { name: "classroom", version: "1.0.0" },
    verboseLogs: false,
  },
);

/** Tool results travel as text; JSON keeps them machine-readable. */
function text(result: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ],
  };
}

/**
 * `required: true` — no anonymous access, ever. The bearer is checked
 * before any tool runs; an unconfigured deployment has no valid bearer
 * and so refuses everything.
 */
const authed = withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!mcpConfigured() || !bearerAccepted(bearer)) return undefined;
    return { token: bearer!, clientId: "classroom-service-token", scopes: [] };
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };
