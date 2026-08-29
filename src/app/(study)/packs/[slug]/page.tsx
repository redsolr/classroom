import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  studyPackItems,
  studyPacks,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { PackView } from "@/components/study/pack-view";
import { BackLink, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Official book" };

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

  const [items, savedRows, bookRows, membershipRows] = await Promise.all([
    db
      .select()
      .from(studyPackItems)
      .where(eq(studyPackItems.packId, pack.id))
      .orderBy(asc(studyPackItems.position)),
    // Ids too, not just terms: filing a word into a book and removing it
    // from one both need the learner's own vocab row, and the ✓ state is
    // keyed on the same lowercased term the add action dedups on.
    db
      .select({
        id: studyVocab.id,
        term: studyVocab.term,
        // Un-hearting a word that carries review history costs
        // something; the row has to know that before it can decide
        // whether to ask first.
        srsReps: studyVocab.srsReps,
      })
      .from(studyVocab)
      .where(
        and(
          eq(studyVocab.learnerId, learner.id),
          eq(studyVocab.language, pack.language),
        ),
      ),
    db
      .select({
        id: studyVocabLists.id,
        name: studyVocabLists.name,
        isDefault: studyVocabLists.isDefault,
      })
      .from(studyVocabLists)
      .where(eq(studyVocabLists.learnerId, learner.id))
      .orderBy(asc(studyVocabLists.createdAt)),
    db
      .select({
        listId: studyVocabListItems.listId,
        vocabId: studyVocabListItems.vocabId,
      })
      .from(studyVocabListItems)
      .innerJoin(
        studyVocabLists,
        eq(studyVocabListItems.listId, studyVocabLists.id),
      )
      .where(eq(studyVocabLists.learnerId, learner.id)),
  ]);

  // term (lowercased) → the learner's row + the books holding it, which
  // is everything the pack rows need to render their saved state.
  const savedByTerm = Object.fromEntries(
    savedRows.map((row) => [
      row.term.toLowerCase(),
      {
        vocabId: row.id,
        reviewed: row.srsReps > 0,
        bookIds: membershipRows
          .filter((m) => m.vocabId === row.id)
          .map((m) => m.listId),
      },
    ]),
  );

  return (
    <PageShell>
      <BackLink href="/packs">All official books</BackLink>
      {/* The title lives in PackView's hero — the copy actions belong
          with the art, and two headers on one page is one too many. */}
      <div className="max-w-3xl">
        <PackView
          pack={pack}
          items={items}
          initialSaved={savedByTerm}
          books={bookRows}
          defaultBookName={bookRows.find((b) => b.isDefault)?.name ?? null}
        />
      </div>
    </PageShell>
  );
}
