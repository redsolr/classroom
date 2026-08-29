import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { BookMarked } from "lucide-react";
import { db, studyPackItems, studyPacks } from "@/db";
import { requireLearner } from "@/lib/auth";
import { PackCover } from "@/components/study/pack-cover";
import { SectionTabs } from "@/components/study/section-tabs";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Official books" };

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
        title="Official books"
        subtitle="Ready-made vocabulary for the things you actually do — take the words you want, save the whole book, or drill it as a deck without saving anything."
      />

      <SectionTabs
        tabs={[
          { href: "/books", label: "My books", active: false },
          { href: "/official", label: "Official", active: true },
        ]}
      />

      {packs.length === 0 ? (
        <p className="text-[0.9375rem] text-fg-tertiary">
          No official books yet — they're on the way.
        </p>
      ) : (
        <div className="packs-shelf grid max-w-4xl grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {packs.map((pack) => (
            <Link
              key={pack.id}
              href={`/official/${pack.slug}`}
              className="pack-volume group block"
            >
              <PackCover
                slug={pack.slug}
                name={pack.name}
                language={pack.language}
                className="transition duration-200 group-hover:brightness-110"
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
