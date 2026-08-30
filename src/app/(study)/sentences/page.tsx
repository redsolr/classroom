import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { MessageSquareQuote, Play } from "lucide-react";
import { db, studySentences, studyDecks } from "@/db";
import { requireLearner } from "@/lib/auth";
import { isCardDue } from "@/lib/srs";
import { SentenceList } from "@/components/study/sentence-list";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Sentences" };

/**
 * SENTENCES — the second card type's home.
 *
 * Separate from Books on purpose. A book is a pile of words; a sentence
 * card is one word doing a job inside real language. Sharing a page
 * would have made "sentences" read as a view of the vocabulary, which is
 * exactly the confusion the naming pass killed everywhere else.
 */
export default async function StudySentencesPage() {
  const learner = await requireLearner();
  const now = new Date();

  const [sentences, books] = await Promise.all([
    db
      .select()
      .from(studySentences)
      .where(eq(studySentences.learnerId, learner.id))
      .orderBy(desc(studySentences.createdAt)),
    db
      .select({ id: studyDecks.id, name: studyDecks.name })
      .from(studyDecks)
      .where(eq(studyDecks.learnerId, learner.id))
      .orderBy(asc(studyDecks.createdAt)),
  ]);

  const dueCount = sentences.filter((s) => isCardDue(s.srsDueAt, now)).length;

  return (
    <PageShell>
      <PageHeader
        icon={MessageSquareQuote}
        title="Sentences"
        subtitle={
          sentences.length === 0
            ? "Cloze cards built from words you already have — the context check."
            : `${sentences.length} card${sentences.length === 1 ? "" : "s"}${dueCount > 0 ? ` · ${dueCount} due` : " · nothing due right now"}`
        }
        actions={
          dueCount > 0 && (
            <Link
              href="/decks?sentences=all"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-practice px-3.5 text-[0.9375rem] font-medium text-white shadow-sm transition-colors hover:bg-practice-hover"
            >
              <Play className="size-4 fill-current" />
              Review {dueCount}
            </Link>
          )
        }
      />

      <div className="max-w-3xl">
        <SentenceList sentences={sentences} books={books} />
      </div>
    </PageShell>
  );
}
