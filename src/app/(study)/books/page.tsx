import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { BookOpenCheck, Layers, Play } from "lucide-react";
import {
  db,
  studyPackItems,
  studyPacks,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { isCardDue } from "@/lib/srs";
import { membersByList } from "@/lib/study-shelves";
import { QuickAddVocabDialog } from "@/components/study/quick-add-vocab-dialog";
import {
  CollectionHero,
  PlayAction,
} from "@/components/study/collection-hero";
import { OfficialShelf } from "@/components/study/official-shelf";
import { SectionTabs } from "@/components/study/section-tabs";
import { BookTile, LikedCover } from "@/components/study/study-covers";
import {
  VocabShelf,
  AddWordDialogButton,
} from "@/components/study/vocab-shelf";
import {
  VocabTable,
  type VocabListSummary,
} from "@/components/study/vocab-table";
import { Button } from "@/components/ui/button";
import { BackLink, PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Books" };

export default async function StudyVocabPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>;
}) {
  const learner = await requireLearner();
  const { book } = await searchParams;
  const now = new Date();

  const [items, listRows, listItemRows, officialRows] = await Promise.all([
    db
      .select()
      .from(studyVocab)
      .where(eq(studyVocab.learnerId, learner.id))
      .orderBy(desc(studyVocab.createdAt)),
    db
      .select({
        id: studyVocabLists.id,
        name: studyVocabLists.name,
        pinned: studyVocabLists.pinned,
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
      .where(eq(studyVocabLists.learnerId, learner.id))
      .orderBy(
        asc(studyVocabListItems.listId),
        asc(studyVocabListItems.position),
      ),
    // The official catalog rides along so the Books page can SHOW it
    // rather than hide it behind a tab.
    db
      .select({
        id: studyPacks.id,
        slug: studyPacks.slug,
        name: studyPacks.name,
        language: studyPacks.language,
        itemCount: sql<number>`count(${studyPackItems.id})::int`,
      })
      .from(studyPacks)
      .leftJoin(studyPackItems, eq(studyPackItems.packId, studyPacks.id))
      .groupBy(studyPacks.id)
      .orderBy(asc(studyPacks.name)),
  ]);

  const members = membersByList(listItemRows);
  const lists: VocabListSummary[] = listRows.map((list) => ({
    ...list,
    itemIds: members.get(list.id) ?? [],
  }));

  const dueCount = items.filter((item) => isCardDue(item.srsDueAt, now)).length;
  const activeBook =
    book && book !== "all" ? (lists.find((l) => l.id === book) ?? null) : null;
  const showTable = book === "all" || activeBook !== null;

  // ── Book / All-words view: the compact table ──
  if (showTable) {
    const byId = new Map(items.map((i) => [i.id, i]));
    const visible = activeBook
      ? activeBook.itemIds
          .map((id) => byId.get(id))
          .filter((i): i is (typeof items)[number] => !!i)
      : items;
    const bookLanguage = visible[0]?.language;
    // Books are study units, not just groupings — a book with due cards
    // offers its own session (`/decks?book=`), scoped to it.
    const bookDueCount = visible.filter((item) =>
      isCardDue(item.srsDueAt, now),
    ).length;

    const reviewHref = `/decks?book=${activeBook?.id ?? "all"}`;

    return (
      <PageShell>
        <BackLink href="/books">My books</BackLink>
        {/* The playlist-page shape: art, an oversized title, and one
            loud action. A book is a place you arrive at, not a filter
            you applied. */}
        <CollectionHero
          hueSeed={activeBook ? activeBook.name : 262}
          cover={
            activeBook ? (
              <BookTile name={activeBook.name} />
            ) : (
              <LikedCover />
            )
          }
          eyebrow={activeBook ? "Book" : "Your vocabulary"}
          title={activeBook?.name ?? "All words"}
          meta={
            <>
              {visible.length} word{visible.length === 1 ? "" : "s"}
              {bookDueCount > 0 && ` · ${bookDueCount} due`}
              {activeBook?.isDefault && " · default book"}
            </>
          }
          actions={
            <>
              <PlayAction href={reviewHref}>
                <Play className="size-4 fill-current" />
                {bookDueCount > 0 ? `Review ${bookDueCount}` : "Practice"}
              </PlayAction>
              {activeBook ? (
                <QuickAddVocabDialog
                  bookId={activeBook.id}
                  bookName={activeBook.name}
                  defaultLanguage={bookLanguage}
                >
                  <Button>New word</Button>
                </QuickAddVocabDialog>
              ) : (
                <AddWordDialogButton />
              )}
            </>
          }
        />
        <div className="max-w-4xl">
          <VocabTable
            items={visible}
            lists={lists}
            view={
              activeBook ? { id: activeBook.id, name: activeBook.name } : "all"
            }
          />
        </div>
      </PageShell>
    );
  }

  // ── Landing: the learner's bookshelf ──
  // No greeting here any more. It made sense while Books was the first
  // thing a learner saw; Home owns the greeting now, and two pages
  // saying good evening is one page too many. This is the library — it
  // states what's in it.
  return (
    <PageShell width="wide">
      <PageHeader
        icon={Layers}
        title="Books"
        subtitle={
          items.length === 0
            ? "Collections of words — yours to build, or taken from an official one."
            : `${items.length} word${items.length === 1 ? "" : "s"} across ${lists.length} book${lists.length === 1 ? "" : "s"}`
        }
        actions={
          dueCount > 0 && (
            <Link
              href="/decks?book=all"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-[0.9375rem] font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
            >
              <BookOpenCheck className="size-4" />
              Review {dueCount} due
            </Link>
          )
        }
      />

      <SectionTabs
        tabs={[
          { href: "/books", label: "My books", active: true },
          {
            href: "/official",
            label: `Official ${officialRows.length}`,
            active: false,
          },
        ]}
      />

      <VocabShelf lists={lists} totalWords={items.length} />

      <div className="mt-10">
        <OfficialShelf items={officialRows} />
      </div>
    </PageShell>
  );
}
