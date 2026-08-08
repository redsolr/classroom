import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { db, students, teachers, type Student, type Teacher } from "@/db";
import { generateAccessToken } from "@/lib/tokens";
import { MOCK_AUTH_ENABLED } from "@/lib/mock-auth";

// Never read process.env.MOCK_AUTH directly — the shared seam welds the
// hatch shut on production builds (see mock-auth.ts).
const MOCK_AUTH = MOCK_AUTH_ENABLED;

const SESSION_COOKIE = process.env.WORKOS_COOKIE_NAME ?? "wos-session";

/**
 * Where to send a request whose access token failed to resolve. If a
 * session cookie still exists this is almost always a refresh race (the
 * token expired between the proxy's refresh and this render — classic on
 * link prefetches), NOT a logout: bounce through /auth/refresh, which is
 * allowed to write cookies, instead of dumping a signed-in teacher on
 * /login.
 */
async function unauthenticatedRedirect(): Promise<never> {
  const cookieStore = await cookies();
  if (!cookieStore.has(SESSION_COOKIE)) redirect("/login");

  const url = (await headers()).get("x-url");
  let next = "/schedule";
  if (url) {
    try {
      const parsed = new URL(url);
      next = parsed.pathname + parsed.search;
    } catch {
      // unparsable header — keep the default
    }
  }
  redirect(`/auth/refresh?next=${encodeURIComponent(next)}`);
}

const MOCK_TEACHER = {
  workosUserId: "mock_teacher_dev",
  email: "teacher@class-room.dev",
  name: "Demo Teacher",
};

async function findOrCreateTeacher(input: {
  workosUserId: string;
  email: string;
  name: string | null;
}): Promise<Teacher> {
  const existing = await db.query.teachers.findFirst({
    where: eq(teachers.workosUserId, input.workosUserId),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(teachers)
    .values({
      workosUserId: input.workosUserId,
      email: input.email,
      name: input.name,
    })
    .onConflictDoUpdate({
      target: teachers.workosUserId,
      set: { email: input.email, updatedAt: new Date() },
    })
    .returning();
  return created;
}

// ---------------------------------------------------------------------------
// Account resolution — one login, two possible roles.
//
// Teachers are the self-serve signup: any unrecognized login becomes a
// teacher (unchanged). A login is a STUDENT when its WorkOS id is already
// linked to a student row, or when its email matches a student the teacher
// created — that first login claims the row (sets workosUserId + ensures a
// portal token so the token-keyed practice/chat surfaces work).
// ---------------------------------------------------------------------------

export type Account =
  | { kind: "teacher"; teacher: Teacher }
  | { kind: "student"; student: Student };

async function resolveStudentAccount(user: {
  id: string;
  email: string;
}): Promise<Student | null> {
  const claimed = await db.query.students.findFirst({
    where: eq(students.workosUserId, user.id),
  });
  if (claimed) {
    if (claimed.portalToken) return claimed;
    // Older claim without a token — the practice/chat surfaces need one.
    const [withToken] = await db
      .update(students)
      .set({
        portalToken: generateAccessToken(),
        updatedAt: new Date(),
      })
      .where(eq(students.id, claimed.id))
      .returning();
    return withToken;
  }

  const claimable = await db.query.students.findFirst({
    where: and(eq(students.email, user.email), isNull(students.workosUserId)),
  });
  if (!claimable) return null;

  const [updated] = await db
    .update(students)
    .set({
      workosUserId: user.id,
      portalToken: claimable.portalToken ?? generateAccessToken(),
      updatedAt: new Date(),
    })
    .where(eq(students.id, claimable.id))
    .returning();
  return updated;
}

export const resolveAccount = cache(async (): Promise<Account | null> => {
  if (MOCK_AUTH) {
    return { kind: "teacher", teacher: await findOrCreateTeacher({ ...MOCK_TEACHER }) };
  }
  const { user } = await withAuth();
  if (!user) return null;

  // An existing teacher row always wins — teachers can also appear in
  // someone's student roster without losing their teacher account.
  const teacher = await db.query.teachers.findFirst({
    where: eq(teachers.workosUserId, user.id),
  });
  if (teacher) return { kind: "teacher", teacher };

  const student = await resolveStudentAccount(user);
  if (student) return { kind: "student", student };

  // Unrecognized login → self-serve teacher signup (unchanged behavior).
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return {
    kind: "teacher",
    teacher: await findOrCreateTeacher({
      workosUserId: user.id,
      email: user.email,
      name,
    }),
  };
});

/**
 * Resolve the signed-in teacher. Student logins are routed to their own
 * area; unauthenticated requests to /login (or the refresh bounce).
 *
 * Wrapped in React `cache` so a page and its nested components share
 * one lookup per request.
 */
export const requireTeacher = cache(async (): Promise<Teacher> => {
  const account = await resolveAccount();
  if (!account) return unauthenticatedRedirect();
  if (account.kind === "student") redirect("/student");
  return account.teacher;
});

/** Resolve the signed-in student; teachers are sent to their schedule. */
export const requireStudent = cache(async (): Promise<Student> => {
  const account = await resolveAccount();
  if (!account) return unauthenticatedRedirect();
  if (account.kind === "teacher") redirect("/schedule");
  return account.student;
});

/** Non-redirecting variant for public pages that adapt to auth state. */
export const getAccount = cache(async (): Promise<Account | null> => {
  const cookieStore = await cookies();
  if (!MOCK_AUTH && !cookieStore.has(SESSION_COOKIE)) return null;
  return resolveAccount();
});
