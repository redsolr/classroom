import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { House, MessageCircle, Play, SquarePen } from "lucide-react";
import {
  db,
  studyMessages,
  studyPackItems,
  studyPacks,
  studySentences,
  studyThreads,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { isCardDue } from "@/lib/srs";
import { threadTitle } from "@/lib/study-display";
import { Greeting } from "@/components/study/greeting";
import { OfficialShelf } from "@/components/study/official-shelf";
import { QuickPicks, type QuickPick } from "@/components/study/quick-picks";
import { Shelf } from "@/components/study/shelf";
import { BookTile } from "@/components/study/study-covers";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Home" };

/** Quick picks stay a handful. Past that it's the library, not a shortcut. */
const MAX_PICKS = 6;
/** Recent chats worth surfacing — the rest live in the sidebar tree. */
const MAX_CHATS = 4;

/**
 * HOME — what you land on when you open the app with no particular plan.
 *
 * Every other study page answers "where is my stuff": Books manages
 * collections, Decks lists what you can drill, Sentences manages cards.
 * None of them answer "what should I do right now", which is the
 * question someone opening the app at 8am actually has. Home answers
 * exactly that and owns nothing: every tile is a link into a surface
 * that already existed.
 *
 * Order is deliberate — what's WAITING first (cards don't stay due
 * politely), what you were doing second, what you could start last.
 */
export default async function StudyHomePage() {
  const learner = await requireLearner();
  const now = new Date();

  const [words, listRows, listItemRows, sentenceRows, officialRows, recent] =
    await Promise.all([
      db
        .select({ id: studyVocab.id, srsDueAt: studyVocab.srsDueAt })
        .from(studyVocab)
        .where(eq(studyVocab.learnerId, learner.id)),
      db
        .select({
          id: studyVocabLists.id,
          name: studyVocabLists.name,
          isDefault: studyVocabLists.isDefault,
          updatedAt: studyVocabLists.updatedAt,
        })
        .from(studyVocabLists)
        .where(eq(studyVocabLists.learnerId, learner.id))
        .orderBy(desc(studyVocabLists.updatedAt)),
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
      db
        .select({ id: studySentences.id, srsDueAt: studySentences.srsDueAt })
        .from(studySentences)
        .where(eq(studySentences.learnerId, learner.id)),
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
      // Chats with at least one message: an empty draft thread is not
      // something anyone wants to "pick up where they left off" on.
      db
        .select({
          id: studyThreads.id,
          title: studyThreads.title,
          language: studyThreads.language,
        })
        .from(studyThreads)
        .where(
          and(
            eq(studyThreads.learnerId, learner.id),
            sql`exists (select 1 from ${studyMessages} m where m.thread_id = ${studyThreads.id})`,
            isNotNull(studyThreads.updatedAt),
          ),
        )
        .orderBy(desc(studyThreads.updatedAt))
        .limit(MAX_CHATS),
    ]);

  const dueById = new Map(words.map((w) => [w.id, isCardDue(w.srsDueAt, now)]));
  const wordsDue = words.filter((w) => isCardDue(w.srsDueAt, now)).length;
  const sentencesDue = sentenceRows.filter((s) =>
    isCardDue(s.srsDueAt, now),
  ).length;
  const totalDue = wordsDue + sentencesDue;

  const books = listRows.map((list) => {
    const memberIds = listItemRows
      .filter((row) => row.listId === list.id)
      .map((row) => row.vocabId);
    return {
      ...list,
      wordCount: memberIds.length,
      dueCount: memberIds.filter((id) => dueById.get(id)).length,
    };
  });

  // Anything WAITING leads; then books you touched most recently. Sorting
  // by due-count means the picks reorder themselves as the day goes on
  // instead of being a fixed menu.
  const picks: QuickPick[] = [
    ...(words.length > 0
      ? [
          {
            key: "all",
            name: "All words",
            detail:
              wordsDue > 0
                ? `${wordsDue} due`
                : `${words.length} word${words.length === 1 ? "" : "s"}`,
            href: wordsDue > 0 ? "/decks?book=all" : "/books?book=all",
            art: "liked" as const,
            playable: wordsDue > 0,
          },
        ]
      : []),
    ...(sentenceRows.length > 0
      ? [
          {
            key: "sentences",
            name: "Sentences",
            detail:
              sentencesDue > 0
                ? `${sentencesDue} due`
                : `${sentenceRows.length} card${sentenceRows.length === 1 ? "" : "s"}`,
            href:
              sentencesDue > 0 ? "/decks?sentences=all" : "/sentences",
            art: "sentences" as const,
            playable: sentencesDue > 0,
          },
        ]
      : []),
    ...books
      .slice()
      .sort((a, b) => b.dueCount - a.dueCount)
      .map((book) => ({
        key: book.id,
        name: book.name,
        detail:
          book.dueCount > 0
            ? `${book.dueCount} due`
            : `${book.wordCount} word${book.wordCount === 1 ? "" : "s"}${book.isDefault ? " · default" : ""}`,
        href:
          book.dueCount > 0
            ? `/decks?book=${book.id}`
            : `/books?book=${book.id}`,
        art: "book" as const,
        playable: book.dueCount > 0,
      })),
  ].slice(0, MAX_PICKS);

  const firstRun = words.length === 0 && sentenceRows.length === 0;

  return (
    <PageShell>
      <PageHeader
        icon={House}
        title={<Greeting />}
        subtitle={
          firstRun
            ? "Start a chat, or take an official book — anything you save shows up here."
            : totalDue > 0
              ? `${totalDue} card${totalDue === 1 ? "" : "s"} are ready for you.`
              : "Nothing due right now — good time to learn something new."
        }
        actions={
          <div className="flex items-center gap-2">
            {totalDue > 0 && (
              <Link
                href={
                  wordsDue > 0
                    ? "/decks?book=all"
                    : "/decks?sentences=all"
                }
                className="inline-flex h-10 items-center gap-2 rounded-full bg-practice pr-5 pl-4 text-[0.9375rem] font-semibold text-white shadow-sm transition-colors hover:bg-practice-hover"
              >
                <Play className="size-4 fill-current" />
                Review {totalDue}
              </Link>
            )}
            <Link
              href="/chat"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-surface px-3.5 text-[0.9375rem] font-medium shadow-card transition-colors hover:bg-surface-hover"
            >
              <SquarePen className="size-4 text-fg-tertiary" />
              New chat
            </Link>
          </div>
        }
      />

      <div className="max-w-3xl space-y-8">
        {picks.length > 0 && (
          <section className="home-picks">
            <h2 className="mb-3 text-[1rem] font-semibold">
              {totalDue > 0 ? "Waiting for you" : "Pick up where you left off"}
            </h2>
            <QuickPicks items={picks} />
          </section>
        )}

        {books.length > 0 && (
          <Shelf title="Your books" seeAllHref="/books" className="home-books">
            {books.map((book) => (
              <li key={book.id} className="w-[124px] shrink-0">
                <Link href={`/books?book=${book.id}`} className="group block">
                  <BookTile
                    name={book.name}
                    className="transition-transform group-hover:-translate-y-1"
                  />
                  <span className="mt-2 block truncate text-[0.875rem] font-medium">
                    {book.name}
                  </span>
                  <span className="block text-[0.8125rem] text-fg-tertiary">
                    {book.wordCount} word{book.wordCount === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </Shelf>
        )}

        {recent.length > 0 && (
          <section className="home-chats">
            <h2 className="mb-3 text-[1rem] font-semibold">Recent chats</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card">
              {recent.map((thread) => (
                <li key={thread.id}>
                  <Link
                    href={`/chat?t=${thread.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                  >
                    <MessageCircle className="size-4 shrink-0 text-fg-tertiary" />
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
                      {threadTitle(thread)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <OfficialShelf items={officialRows} />
    </PageShell>
  );
}
