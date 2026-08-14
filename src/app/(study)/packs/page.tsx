import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { BookMarked } from "lucide-react";
import { db, studyPackItems, studyPacks } from "@/db";
import { requireLearner } from "@/lib/auth";
import { PageHeader, PageShell } from "@/components/ui/page-header";

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
    <PageShell>
      <PageHeader
        icon={BookMarked}
        title="Curated lists"
        subtitle="Ready-made vocabulary for the things you actually do — pick a pack, add the words you want (or the whole thing) to your own dictionary."
      />

      {packs.length === 0 ? (
        <p className="text-[0.9375rem] text-fg-tertiary">
          No curated lists yet — they're on the way.
        </p>
      ) : (
        <ul className="grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
          {packs.map((pack) => (
            <li key={pack.id}>
              <Link
                href={`/packs/${pack.slug}`}
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
    </PageShell>
  );
}
