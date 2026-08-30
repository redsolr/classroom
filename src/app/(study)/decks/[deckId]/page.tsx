import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Play, Trophy } from "lucide-react";
import { db, studyBooks, studyVocab } from "@/db";
import { requireLearner } from "@/lib/auth";
import { isCardDue } from "@/lib/srs";
import {
  deckSummaryRows,
  isPlatinum,
  loadDecks,
} from "@/lib/study-book-queries";
import { deckRunHistory } from "@/lib/deck-runs";
import { QuickAddVocabDialog } from "@/components/study/quick-add-vocab-dialog";
import { CollectionHero, PlayAction } from "@/components/study/collection-hero";
import { DeckRecords } from "@/components/study/deck-records";
import { BookTile, LikedCover } from "@/components/study/study-covers";
import { VocabTable } from "@/components/study/vocab-table";
import { AddWordDialogButton } from "@/components/study/vocab-shelf";
import { Button } from "@/components/ui/button";
import { BackLink, PageShell } from "@/components/ui/page-header";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ deckId: string }>;
}): Promise<Metadata> {
  const learner = await requireLearner();
  const { deckId } = await params;
  if (deckId === "all") return { title: "All words" };
  const decks = await loadDecks(learner.id);
  return { title: decks.find((d) => d.id === deckId)?.name ?? "Deck" };
}

/**
 * ONE DECK — its words, and its record.
 *
 * This is the compact table that used to live at `/books?book=<id>`,
 * moved to a path of its own now that a deck is a first-class thing
 * rather than a filter over the Books page. The old URL still redirects.
 *
 * `deckId === "all"` is the LIKED LAYER, not a deck: every word the
 * learner ever saved, whichever deck filed it. It has no records and no
 * trophy, because it is not something you can finish — that is the
 * point of it.
 */
export default async function StudyDeckPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const learner = await requireLearner();
  const { deckId } = await params;
  const now = new Date();

  const [items, decks, { rows: summaries }] = await Promise.all([
    db
      .select()
      .from(studyVocab)
      .where(eq(studyVocab.learnerId, learner.id))
      .orderBy(desc(studyVocab.createdAt)),
    loadDecks(learner.id, now),
    deckSummaryRows(learner.id),
  ]);

  const all = deckId === "all";
  const deck = all ? null : decks.find((d) => d.id === deckId);
  if (!all && !deck) notFound();

  const byDeck = new Map(summaries.map((s) => [s.id, s.itemIds]));
  const byId = new Map(items.map((i) => [i.id, i]));
  const visible = deck
    ? (byDeck.get(deck.id) ?? [])
        .map((id) => byId.get(id))
        .filter((i): i is (typeof items)[number] => !!i)
    : items;

  const dueCount = visible.filter((i) => isCardDue(i.srsDueAt, now)).length;
  const platinum = deck ? isPlatinum(visible) : false;
  const language = visible[0]?.language;

  const [book, runs] = await Promise.all([
    deck?.bookId
      ? db.query.studyBooks.findFirst({
          where: and(
            eq(studyBooks.id, deck.bookId),
            eq(studyBooks.learnerId, learner.id),
          ),
          columns: { id: true, title: true },
        })
      : Promise.resolve(undefined),
    deck ? deckRunHistory(learner.id, deck.id) : Promise.resolve([]),
  ]);

  return (
    <PageShell>
      {book ? (
        <BackLink href={`/books/${book.id}`}>{book.title}</BackLink>
      ) : (
        <BackLink href="/books">Books</BackLink>
      )}

      <CollectionHero
        hueSeed={deck ? deck.name : 262}
        cover={deck ? <BookTile name={deck.name} /> : <LikedCover />}
        eyebrow={deck ? "Deck" : "Your vocabulary"}
        title={deck?.name ?? "All words"}
        meta={
          <>
            {visible.length} word{visible.length === 1 ? "" : "s"}
            {dueCount > 0 && ` · ${dueCount} due`}
            {deck?.isDefault && " · default deck"}
            {platinum && " · fully mastered"}
          </>
        }
        actions={
          <>
            <PlayAction href={`/decks?book=${deck?.id ?? "all"}`}>
              <Play className="size-4 fill-current" />
              {dueCount > 0 ? `Review ${dueCount}` : "Practice"}
            </PlayAction>
            {deck ? (
              <QuickAddVocabDialog
                bookId={deck.id}
                bookName={deck.name}
                defaultLanguage={language}
              >
                <Button>New word</Button>
              </QuickAddVocabDialog>
            ) : (
              <AddWordDialogButton />
            )}
          </>
        }
      />

      <div className="max-w-4xl space-y-5">
        {platinum && (
          <p className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-[0.9375rem] shadow-card">
            <Trophy className="size-5 shrink-0 text-[hsl(43_74%_52%)]" />
            <span>
              <strong>Fully mastered.</strong> Every card in this deck has
              come back after a long gap and you still had it — that is
              what mastered means here, and it is the only way to earn
              this.
            </span>
          </p>
        )}

        {deck && <DeckRecords runs={runs} />}

        <VocabTable
          items={visible}
          lists={summaries}
          view={deck ? { id: deck.id, name: deck.name } : "all"}
        />

        {visible.length === 0 && (
          <p className="text-[0.875rem] text-fg-tertiary">
            Nothing here yet.{" "}
            <Link href="/official" className="underline underline-offset-2">
              Take an official book
            </Link>{" "}
            or add a word by hand.
          </p>
        )}
      </div>
    </PageShell>
  );
}
