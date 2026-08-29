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
import { Shelf, ShelfCard } from "@/components/study/shelf";
import {
  BookTile,
  LikedCover,
  SentenceCover,
} from "@/components/study/study-covers";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Home" };

/** One resumable thing: a collection, its state, and where it goes. */
type QuickPick = {
  key: string;
  name: string;
  /** One line of state: "12 due", "48 words", … */
  detail: string;
  href: string;
  art: "liked" | "book" | "sentences";
  /** Draws the play overlay — only when there's something to drill. */
  playable?: boolean;
};

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
              ? // The spotlight below says the count at 4rem; repeating
                // it here would be the same sentence twice.
                "Here's what's waiting."
              : "Nothing due right now — good time to learn something new."
        }
        actions={
          <div className="flex items-center gap-2">
            {/* No Review button here — the spotlight below IS that
                button, and two of them would compete. */}
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

      {/* THE FOCAL POINT. A home page whose loudest element is a list of
          links has no centre — this is the one thing worth doing right
          now, said at a size you can read from across the room. It only
          exists when something is actually due; an always-on banner
          stops being information. */}
      {totalDue > 0 && (
        <section
          className="home-spotlight mb-10 flex flex-wrap items-center gap-x-6 gap-y-4 overflow-hidden rounded-2xl p-6 shadow-card sm:p-8"
          style={{
            background:
              "linear-gradient(120deg, var(--practice) 0%, hsl(340 72% 34%) 55%, hsl(266 60% 32%) 100%)",
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-semibold tracking-wide text-white/75 uppercase">
              Ready to review
            </p>
            <p className="mt-1 flex items-baseline gap-2 text-white">
              <span className="text-[3rem] leading-none font-bold tracking-tight sm:text-[4rem]">
                {totalDue}
              </span>
              <span className="text-[1.125rem] font-medium">
                card{totalDue === 1 ? "" : "s"}
              </span>
            </p>
            <p className="mt-1 text-[0.9375rem] text-white/80">
              {wordsDue > 0 && sentencesDue > 0
                ? `${wordsDue} word${wordsDue === 1 ? "" : "s"} and ${sentencesDue} sentence${sentencesDue === 1 ? "" : "s"} waiting.`
                : wordsDue > 0
                  ? "Swipe through them — spaced repetition handles the rest."
                  : "Fill the blanks — the context check."}
            </p>
          </div>
          <Link
            href={wordsDue > 0 ? "/decks?book=all" : "/decks?sentences=all"}
            className="home-spotlight-cta inline-flex h-12 shrink-0 items-center gap-2.5 rounded-full bg-white pr-7 pl-6 text-[1rem] font-semibold text-neutral-900 shadow-sm transition-transform hover:scale-[1.02]"
          >
            <Play className="size-5 fill-current" />
            Start reviewing
          </Link>
        </section>
      )}

      <div className="max-w-3xl space-y-10">
        {picks.length > 0 && (
          <Shelf
            title={totalDue > 0 ? "Waiting for you" : "Jump back in"}
            className="home-picks"
          >
            {picks.map((pick) => (
              <ShelfCard
                key={pick.key}
                href={pick.href}
                name={pick.name}
                detail={pick.detail}
                badge={pick.playable ? pick.detail : undefined}
                playable={pick.playable}
                cover={
                  pick.art === "liked" ? (
                    <LikedCover />
                  ) : pick.art === "sentences" ? (
                    <SentenceCover />
                  ) : (
                    <BookTile name={pick.name} />
                  )
                }
              />
            ))}
          </Shelf>
        )}

        {books.length > 0 && (
          <Shelf title="Your books" seeAllHref="/books" className="home-books">
            {books.map((book) => (
              <ShelfCard
                key={book.id}
                href={`/books?book=${book.id}`}
                name={book.name}
                detail={`${book.wordCount} word${book.wordCount === 1 ? "" : "s"}`}
                cover={<BookTile name={book.name} />}
              />
            ))}
          </Shelf>
        )}

        {recent.length > 0 && (
          <section className="home-chats">
            <h2 className="mb-3 text-[1.375rem] font-bold tracking-tight">
              Recent chats
            </h2>
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
