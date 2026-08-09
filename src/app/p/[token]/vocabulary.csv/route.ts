import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, students, vocabularyItems } from "@/db";

/**
 * Byte-order mark so Excel opens non-ASCII vocabulary correctly (Anki
 * ignores it). Kept identical to the learner export at
 * /study/vocab/export.csv.
 */
const UTF8_BOM = String.fromCharCode(0xfeff);

function csvField(value: string | null): string {
  if (value == null) return "";
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Student-facing vocabulary export — plain CSV, importable into Anki or
 * any spreadsheet. Token-authorized like the rest of the portal.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const student = await db.query.students.findFirst({
    where: eq(students.portalToken, token),
    columns: { id: true },
  });
  if (!student) return new NextResponse("Not found", { status: 404 });

  const items = await db
    .select()
    .from(vocabularyItems)
    .where(eq(vocabularyItems.studentId, student.id))
    .orderBy(desc(vocabularyItems.createdAt));

  const lines = [
    "term,meaning,translation,example,language,status",
    ...items.map((v) =>
      [
        csvField(v.term),
        csvField(v.meaning),
        csvField(v.translation),
        csvField(v.example),
        csvField(v.language),
        csvField(v.status),
      ].join(","),
    ),
  ];

  return new NextResponse(`${UTF8_BOM}${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vocabulary.csv"`,
    },
  });
}
