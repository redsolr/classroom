import { NextResponse } from "next/server";

/**
 * Shared CSV plumbing for the two vocabulary exports (roster
 * /p/[token]/vocabulary.csv and learner /study/vocab/export.csv) so
 * their format can never drift apart.
 */

/**
 * Byte-order mark. Anki strips it, but without it Excel on Windows
 * renders 猫 and accented French as mojibake. Built from the code point
 * rather than an inline "﻿" so the character is visible in the source.
 */
export const UTF8_BOM = String.fromCharCode(0xfeff);

export function csvField(value: string | null): string {
  if (value == null) return "";
  return `"${value.replaceAll('"', '""')}"`;
}

/** CRLF-joined, BOM-prefixed CSV download response. */
export function csvResponse(lines: string[], filename: string): NextResponse {
  return new NextResponse(`${UTF8_BOM}${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
