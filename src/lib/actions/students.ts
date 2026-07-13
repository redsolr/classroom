"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, goals, insights, students } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { assertStudentOwned } from "@/lib/guards";

const studentSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email().optional().or(z.literal("")),
  targetLanguage: z.string().trim().min(1, "Target language is required"),
  nativeLanguage: z.string().trim().optional(),
  currentLevel: z.string().trim().optional(),
  targetLevel: z.string().trim().optional(),
  status: z.enum(["active", "trial", "paused", "inactive"]).default("active"),
  timezone: z.string().trim().optional(),
  platform: z.string().trim().optional(),
  lessonFrequency: z.string().trim().optional(),
});

function opt(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

export async function createStudent(formData: FormData) {
  const teacher = await requireTeacher();
  const parsed = studentSchema.parse(Object.fromEntries(formData));

  const [created] = await db
    .insert(students)
    .values({
      teacherId: teacher.id,
      name: parsed.name,
      email: opt(parsed.email),
      targetLanguage: parsed.targetLanguage,
      nativeLanguage: opt(parsed.nativeLanguage),
      currentLevel: opt(parsed.currentLevel),
      targetLevel: opt(parsed.targetLevel),
      status: parsed.status,
      timezone: opt(parsed.timezone),
      platform: opt(parsed.platform),
      lessonFrequency: opt(parsed.lessonFrequency),
    })
    .returning({ id: students.id });

  revalidatePath("/students");
  redirect(`/students/${created.id}`);
}

export async function updateStudent(studentId: string, formData: FormData) {
  const teacher = await requireTeacher();
  const parsed = studentSchema.parse(Object.fromEntries(formData));

  await db
    .update(students)
    .set({
      name: parsed.name,
      email: opt(parsed.email),
      targetLanguage: parsed.targetLanguage,
      nativeLanguage: opt(parsed.nativeLanguage),
      currentLevel: opt(parsed.currentLevel),
      targetLevel: opt(parsed.targetLevel),
      status: parsed.status,
      timezone: opt(parsed.timezone),
      platform: opt(parsed.platform),
      lessonFrequency: opt(parsed.lessonFrequency),
      updatedAt: new Date(),
    })
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id)));

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

export async function updateStudentNotes(studentId: string, formData: FormData) {
  const teacher = await requireTeacher();
  const notes = z.string().parse(formData.get("generalNotes") ?? "");

  await db
    .update(students)
    .set({ generalNotes: notes || null, updatedAt: new Date() })
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id)));

  revalidatePath(`/students/${studentId}`);
}

export async function deleteStudent(studentId: string) {
  const teacher = await requireTeacher();
  await db
    .delete(students)
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id)));
  revalidatePath("/students");
  redirect("/students");
}

// ---------------------------------------------------------------------------
// Student portal — a revocable token is the student's whole access.
// Rotating invalidates the old link; disabling removes access entirely.
// ---------------------------------------------------------------------------

export async function rotateStudentPortal(studentId: string) {
  const teacher = await requireTeacher();
  await assertStudentOwned(teacher.id, studentId);

  await db
    .update(students)
    .set({
      portalToken: randomBytes(18).toString("base64url"),
      updatedAt: new Date(),
    })
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id)));

  revalidatePath(`/students/${studentId}`);
}

export async function disableStudentPortal(studentId: string) {
  const teacher = await requireTeacher();
  await assertStudentOwned(teacher.id, studentId);

  await db
    .update(students)
    .set({ portalToken: null, updatedAt: new Date() })
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id)));

  revalidatePath(`/students/${studentId}`);
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const goalSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  targetDate: z.string().trim().optional(),
});

export async function createGoal(studentId: string, formData: FormData) {
  const teacher = await requireTeacher();
  await assertStudentOwned(teacher.id, studentId);
  const parsed = goalSchema.parse(Object.fromEntries(formData));

  await db.insert(goals).values({
    teacherId: teacher.id,
    studentId,
    title: parsed.title,
    description: parsed.description || null,
    priority: parsed.priority,
    targetDate: parsed.targetDate ? new Date(parsed.targetDate) : null,
  });

  revalidatePath(`/students/${studentId}`);
}

export async function setGoalStatus(
  goalId: string,
  studentId: string,
  status: "active" | "completed" | "paused",
) {
  const teacher = await requireTeacher();
  await db
    .update(goals)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.teacherId, teacher.id)));
  revalidatePath(`/students/${studentId}`);
}

export async function deleteGoal(goalId: string, studentId: string) {
  const teacher = await requireTeacher();
  await db
    .delete(goals)
    .where(and(eq(goals.id, goalId), eq(goals.teacherId, teacher.id)));
  revalidatePath(`/students/${studentId}`);
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

const insightSchema = z.object({
  type: z.enum([
    "recurringMistake",
    "learningPreference",
    "interest",
    "strength",
    "weakness",
    "teachingStrategy",
    "generalObservation",
  ]),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
});

export async function createInsight(studentId: string, formData: FormData) {
  const teacher = await requireTeacher();
  await assertStudentOwned(teacher.id, studentId);
  const parsed = insightSchema.parse(Object.fromEntries(formData));

  await db.insert(insights).values({
    teacherId: teacher.id,
    studentId,
    type: parsed.type,
    title: parsed.title,
    description: parsed.description || null,
    teacherApproved: true,
  });

  revalidatePath(`/students/${studentId}`);
}

export async function deleteInsight(insightId: string, studentId: string) {
  const teacher = await requireTeacher();
  await db
    .delete(insights)
    .where(and(eq(insights.id, insightId), eq(insights.teacherId, teacher.id)));
  revalidatePath(`/students/${studentId}`);
}
