import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { BookMarked } from "lucide-react";
import { db, studyPackItems, studyPacks } from "@/db";
import { requireLearner } from "@/lib/auth";

export const metadata: Metadata = { title: "Curated lists" };

export default async function StudyPacksPage() {
  await requireLearner();

  const packs = await db
    .select({
      id: studyPacks.id,
      slug: studyPacks.slug,
      name: studyPacks.name,
      language: studyPacks.language,
      description: studyPacks.description,
      itemCount: sql<number>`count(${studyPackItems.id})`,
    })
    .from(studyPacks)
    .leftJoin(studyPackItems, eq(studyPackItems.packId, studyPacks.id))
    .groupBy(studyPacks.id)
    .orderBy(asc(studyPacks.name));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2.5 text-[1.625rem] font-semibold tracking-tight">
          <BookMarked className="size-6 text-accent" />
          Curated lists
        </h1>
        <p className="mt-1 text-[0.9375rem] text-fg-secondary">
          Ready-made vocabulary for the things you actually do — pick a
          pack, add the words you want (or the whole thing) to your own
          dictionary.
        </p>
      </header>

      {packs.length === 0 ? (
        <p className="text-[0.9375rem] text-fg-tertiary">
          No curated lists yet — they're on the way.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {packs.map((pack) => (
            <li key={pack.id}>
              <Link
                href={`/study/packs/${pack.slug}`}
                className="block h-full rounded-xl bg-surface p-4 shadow-card transition-colors hover:bg-surface-hover"
              >
                <p className="text-[1rem] font-semibold">{pack.name}</p>
                <p className="mt-0.5 text-[0.8125rem] text-fg-tertiary">
                  {pack.language} · {pack.itemCount} words
                </p>
                {pack.description && (
                  <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-secondary">
                    {pack.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
