import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, BookMarked, BookOpenCheck } from "lucide-react";
import {
  db,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { isCardDue } from "@/lib/srs";
import { QuickAddVocabDialog } from "@/components/study/quick-add-vocab-dialog";
import {
  VocabShelf,
  AddWordDialogButton,
} from "@/components/study/vocab-shelf";
import {
  VocabTable,
  type VocabListSummary,
} from "@/components/study/vocab-table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "My vocabulary" };

export default async function StudyVocabPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>;
}) {
  const learner = await requireLearner();
  const { book } = await searchParams;
  const now = new Date();

  const [items, listRows, listItemRows] = await Promise.all([
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
  ]);

  const lists: VocabListSummary[] = listRows.map((list) => ({
    ...list,
    itemIds: listItemRows
      .filter((row) => row.listId === list.id)
      .map((row) => row.vocabId),
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

    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <Link
          href="/study/vocab"
          className="mb-3 inline-flex items-center gap-1.5 text-[0.875rem] text-fg-secondary hover:text-fg"
        >
          <ArrowLeft className="size-3.5" />
          My books
        </Link>
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[1.375rem] font-semibold tracking-tight">
              {activeBook?.name ?? "All words"}
            </h1>
            <p className="mt-0.5 text-[0.875rem] text-fg-tertiary">
              {visible.length} word{visible.length === 1 ? "" : "s"}
            </p>
          </div>
          {activeBook ? (
            <QuickAddVocabDialog
              bookId={activeBook.id}
              bookName={activeBook.name}
              defaultLanguage={bookLanguage}
            >
              <Button variant="primary">New word</Button>
            </QuickAddVocabDialog>
          ) : (
            <AddWordDialogButton />
          )}
        </header>
        <VocabTable
          items={visible}
          lists={lists}
          view={activeBook ? { id: activeBook.id, name: activeBook.name } : "all"}
        />
      </div>
    );
  }

  // ── Landing: the learner's bookshelf ──
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-[1.625rem] font-semibold tracking-tight">
            <BookMarked className="size-6 text-accent" />
            My vocabulary
          </h1>
          <p className="mt-1 text-[0.9375rem] text-fg-secondary">
            {items.length === 0
              ? "Your personal dictionary — organized into books."
              : `${items.length} word${items.length === 1 ? "" : "s"} across ${lists.length} book${lists.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {dueCount > 0 && (
          <Link
            href="/study/vocab/review"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-[0.9375rem] font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            <BookOpenCheck className="size-4" />
            Review {dueCount} due
          </Link>
        )}
      </header>

      <VocabShelf lists={lists} totalWords={items.length} />
    </div>
  );
}
