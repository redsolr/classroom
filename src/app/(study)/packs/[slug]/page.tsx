import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, studyPackItems, studyPacks, studyVocab } from "@/db";
import { requireLearner } from "@/lib/auth";
import { PackView } from "@/components/study/pack-view";

export const metadata: Metadata = { title: "Curated list" };

export default async function StudyPackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const learner = await requireLearner();
  const { slug } = await params;

  const pack = await db.query.studyPacks.findFirst({
    where: eq(studyPacks.slug, slug),
  });
  if (!pack) notFound();

  const [items, savedRows] = await Promise.all([
    db
      .select()
      .from(studyPackItems)
      .where(eq(studyPackItems.packId, pack.id))
      .orderBy(asc(studyPackItems.position)),
    db
      .select({ term: studyVocab.term })
      .from(studyVocab)
      .where(
        and(
          eq(studyVocab.learnerId, learner.id),
          eq(studyVocab.language, pack.language),
        ),
      ),
  ]);
  const savedTerms = savedRows.map((r) => r.term.toLowerCase());

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/packs"
        className="mb-4 inline-flex items-center gap-1.5 text-[0.875rem] text-fg-secondary hover:text-fg"
      >
        <ArrowLeft className="size-3.5" />
        All curated lists
      </Link>
      <header className="mb-5">
        <h1 className="text-[1.625rem] font-semibold tracking-tight">
          {pack.name}
        </h1>
        <p className="mt-0.5 text-[0.875rem] text-fg-tertiary">
          {pack.language} · {items.length} words
        </p>
        {pack.description && (
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-secondary">
            {pack.description}
          </p>
        )}
      </header>

      <PackView pack={pack} items={items} initialSavedTerms={savedTerms} />
    </div>
  );
}
