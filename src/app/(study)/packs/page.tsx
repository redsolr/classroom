import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { BookMarked } from "lucide-react";
import { db, studyPackItems, studyPacks } from "@/db";
import { requireLearner } from "@/lib/auth";
import { PackCover } from "@/components/study/pack-cover";
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
        <div className="packs-shelf grid max-w-4xl grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {packs.map((pack) => (
            <Link
              key={pack.id}
              href={`/packs/${pack.slug}`}
              className="pack-volume group block"
            >
              <PackCover
                slug={pack.slug}
                name={pack.name}
                language={pack.language}
                className="transition-transform group-hover:-translate-y-1"
              />
              <span className="mt-2 block truncate text-[0.875rem] font-medium">
                {pack.name}
              </span>
              <span className="block text-[0.8125rem] text-fg-tertiary">
                {pack.itemCount} word{pack.itemCount === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
