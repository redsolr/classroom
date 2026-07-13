"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, teachers } from "@/db";
import { requireTeacher } from "@/lib/auth";

const teacherSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  timezone: z.string().trim().optional(),
  nativeLanguage: z.string().trim().optional(),
  languagesTaught: z.string().trim().optional(),
});

export async function updateTeacherProfile(formData: FormData) {
  const teacher = await requireTeacher();
  const parsed = teacherSchema.parse(Object.fromEntries(formData));

  await db
    .update(teachers)
    .set({
      name: parsed.name,
      timezone: parsed.timezone || null,
      nativeLanguage: parsed.nativeLanguage || null,
      languagesTaught: parsed.languagesTaught
        ? parsed.languagesTaught
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(teachers.id, teacher.id));

  revalidatePath("/settings");
  revalidatePath("/", "layout");
}
