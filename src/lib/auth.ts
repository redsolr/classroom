import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { db, teachers, type Teacher } from "@/db";

const MOCK_AUTH = process.env.MOCK_AUTH === "true";

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

/**
 * Resolve the signed-in teacher, creating the row on first login.
 * Redirects to OUR custom /login when unauthenticated (except in
 * MOCK_AUTH dev mode, which returns a canned teacher).
 *
 * Wrapped in React `cache` so a page and its nested components share
 * one lookup per request.
 */
export const requireTeacher = cache(async (): Promise<Teacher> => {
  if (MOCK_AUTH) {
    return findOrCreateTeacher({ ...MOCK_TEACHER });
  }
  const { user } = await withAuth();
  if (!user) redirect("/login");
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return findOrCreateTeacher({
    workosUserId: user.id,
    email: user.email,
    name,
  });
});

/** Non-redirecting variant for public pages that adapt to auth state. */
export const getTeacher = cache(async (): Promise<Teacher | null> => {
  if (MOCK_AUTH) {
    return findOrCreateTeacher({ ...MOCK_TEACHER });
  }
  const { user } = await withAuth();
  if (!user) return null;
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return findOrCreateTeacher({
    workosUserId: user.id,
    email: user.email,
    name,
  });
});
