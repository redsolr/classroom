import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, studyVocab } from "@/db";
import { getLearner } from "@/lib/auth";

function csvField(value: string | null): string {
  if (value == null) return "";
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Personal vocabulary export — plain CSV, importable into Anki or any
 * spreadsheet (term/reading/meaning lead, Anki front-back-extra order).
 * Same shape as the roster's /p/[token]/vocabulary.csv; learner-scoped,
 * and like the chat API a route handler 401s anonymous callers instead
 * of redirecting.
 */
export async function GET() {
  const learner = await getLearner();
  if (!learner) return new NextResponse("Unauthorized", { status: 401 });

  const items = await db
    .select()
    .from(studyVocab)
    .where(eq(studyVocab.learnerId, learner.id))
    .orderBy(desc(studyVocab.createdAt));

  const lines = [
    "term,reading,meaning,example,language,status",
    ...items.map((v) =>
      [
        csvField(v.term),
        csvField(v.reading),
        csvField(v.meaning),
        csvField(v.example),
        csvField(v.language),
        csvField(v.status),
      ].join(","),
    ),
  ];

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vocabulary.csv"`,
    },
  });
}
