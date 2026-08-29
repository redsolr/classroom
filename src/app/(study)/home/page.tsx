import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { House, Play, SquarePen } from "lucide-react";
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
import { dueIds, membersByList } from "@/lib/study-shelves";
import { threadTitle } from "@/lib/study-display";
import { Greeting } from "@/components/study/greeting";
import { SearchBar } from "@/components/study/search-bar";
import { OfficialShelf } from "@/components/study/official-shelf";
import { PackCover } from "@/components/study/pack-cover";
import { Shelf, ShelfCard } from "@/components/study/shelf";
import {
  ChatTile,
  CollectionCover,
  type CollectionArt,
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
  art: CollectionArt;
  /** Draws the play overlay — only when there's something to drill. */
  playable?: boolean;
};

/** Quick picks stay a handful. Past that it's the library, not a shortcut. */
const MAX_PICKS = 6;
/** Recent chats worth surfacing — the rest live in the sidebar tree. */
const MAX_CHATS = 4;
/** Covers in the spotlight's fan. Four splay cleanly at ±10°; a fifth
 * pushes the stack into the CTA and the outer cards past legibility. */
const MAX_FAN = 4;

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
        .select({
          id: studyVocab.id,
          language: studyVocab.language,
          srsDueAt: studyVocab.srsDueAt,
        })
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
        .select({
          id: studySentences.id,
          srsDueAt: studySentences.srsDueAt,
          // Which book the card was generated from — Home groups sentence
          // cards into their own decks the way /decks does, so a sentence
          // book is reachable without going through a second page.
          listId: studySentences.listId,
        })
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

  const dueWordIds = dueIds(words, now);
  const wordsDue = dueWordIds.size;
  const sentencesDue = dueIds(sentenceRows, now).size;
  const totalDue = wordsDue + sentencesDue;

  const members = membersByList(listItemRows);
  const books = listRows.map((list) => {
    const memberIds = members.get(list.id) ?? [];
    return {
      ...list,
      wordCount: memberIds.length,
      dueCount: memberIds.filter((id) => dueWordIds.has(id)).length,
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
    // Sentences used to sit here as ONE tile. It has its own shelf now
    // (see `sentenceDecks` below) — a single entry could say that cards
    // exist but never which book they came from, so drilling one book's
    // sentences meant leaving Home for Decks.
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

  // What to RECOMMEND: official books in languages the learner already
  // studies, minus the ones they've already saved (importing a pack
  // creates a book named after it, so a name match is the honest
  // "already have this" signal). Real personalisation from real signal —
  // no model involved, and it can say WHY.
  const studiedLanguages = [...new Set(words.map((w) => w.language))];
  const ownedNames = new Set(listRows.map((l) => l.name.toLowerCase()));
  const recommended = officialRows
    .filter(
      (pack) =>
        studiedLanguages.includes(pack.language) &&
        !ownedNames.has(pack.name.toLowerCase()),
    )
    .slice(0, MAX_PICKS);
  const recommendedReason =
    studiedLanguages.length === 1
      ? `Because you're learning ${studiedLanguages[0]}`
      : "Because of what you're learning";

  /**
   * SENTENCE BOOKS — their own row, not a single "Sentences" tile.
   *
   * Home surfaced sentences as one entry in the picks, which is the same
   * mistake Decks made before it became a shelf: it says "you have
   * sentence cards" and hides which BOOKS they belong to, so the only
   * way to drill the sentences from one book was to go to Decks and
   * scroll past the word decks. A sentence deck is a deck; it gets a
   * shelf.
   *
   * "All sentences" leads for the same reason "All words" leads on the
   * word row — it's every card regardless of which book made it.
   */
  const sentenceDueIds = dueIds(sentenceRows, now);
  const sentencesByBook = new Map<string, typeof sentenceRows>();
  for (const row of sentenceRows) {
    if (!row.listId) continue;
    const bucket = sentencesByBook.get(row.listId);
    if (bucket) bucket.push(row);
    else sentencesByBook.set(row.listId, [row]);
  }

  const sentenceDecks: QuickPick[] = [
    ...(sentenceRows.length > 0
      ? [
          {
            key: "sentences-all",
            name: "All sentences",
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
      .filter((book) => sentencesByBook.has(book.id))
      .map((book) => {
        const cards = sentencesByBook.get(book.id) ?? [];
        const due = cards.filter((c) => sentenceDueIds.has(c.id)).length;
        return {
          key: `sentences-${book.id}`,
          name: book.name,
          detail:
            due > 0
              ? `${due} due`
              : `${cards.length} card${cards.length === 1 ? "" : "s"}`,
          href: due > 0 ? `/decks?sentences=${book.id}` : "/sentences",
          art: "sentences" as const,
          playable: due > 0,
        };
      })
      .sort((a, b) => Number(b.playable) - Number(a.playable)),
  ].slice(0, MAX_PICKS);

  /**
   * RECOMMENDED SENTENCES — books whose words have no cloze card yet.
   *
   * The same rule the official-book recommendations follow: real signal,
   * no model, and it can say why. A book you own with words in it and
   * zero sentence cards is the single most useful thing this product can
   * point at, because generating them is one press and the learner would
   * otherwise never think to ask. A book that already has cards is not
   * recommended — repeat presses EXTEND coverage, and that belongs on
   * the Sentences page where the button lives, not in a row that would
   * then never empty.
   */
  const sentenceCandidates = books
    .filter((book) => book.wordCount > 0 && !sentencesByBook.has(book.id))
    .sort((a, b) => b.wordCount - a.wordCount)
    .slice(0, MAX_PICKS);

  const firstRun = words.length === 0 && sentenceRows.length === 0;

  // The covers the spotlight fans out: the decks that actually have
  // something due, in the order the picks already ranked them. Real
  // artwork for real decks — a stack of decorative shapes would be a
  // picture of a feature rather than the feature.
  // Both card types can be waiting, and the fan is about what's DUE, not
  // about which shelf a deck happens to live on.
  const duePreview = [...picks, ...sentenceDecks]
    .filter((pick) => pick.playable)
    .slice(0, MAX_FAN);

  return (
    <PageShell width="wide">
      {/* Phones only — desktop keeps the field pinned in the top bar, so
          a second one here would be the same control twice. */}
      <div className="lg:hidden">
        <SearchBar />
      </div>
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

      {/* THE FOCAL POINT — the one thing worth doing right now. It only
          exists when something is actually due; an always-on banner
          stops being information.
       *
       * TWO shapes, because one did not survive both ends. Stacked on a
       * phone, where a 4rem count is the point and the CTA is a
       * full-width tap target under it. A short BAND from lg, where the
       * stacked version became a 233px-tall slab with its text in one
       * corner and its button in the other, a thousand pixels of empty
       * gradient between them. A wide short band reads as a banner; a
       * wide TALL one reads as a layout that broke.
       *
       * The phone bug was the same root cause: `flex-wrap` never wrapped
       * because the CTA is `shrink-0` while the text column is `flex-1`,
       * so the column collapsed to 87px instead and "cards" — inside a
       * row that cannot wrap — overflowed under the button. Explicit
       * `flex-col` up to lg is the fix for both ends at once.
       *
       * It runs the FULL page width, like the shelves. Capping it was
       * tried and reverted: the band never was the problem — the page
       * was out of proportion, a 320px sidebar against a 1800px content
       * column, so everything on the right read as over-stretched. The
       * fix belongs in the shell (a 420px sidebar), not in a cap on one
       * element that would then disagree with every row beneath it. */}
      {totalDue > 0 && (
        <section
          className="home-spotlight mb-10 flex flex-col gap-5 overflow-hidden rounded-2xl p-6 shadow-card sm:p-8 lg:flex-row lg:items-center lg:gap-8 lg:p-8"
          style={{
            background:
              "linear-gradient(120deg, var(--practice) 0%, hsl(340 72% 34%) 55%, hsl(266 60% 32%) 100%)",
          }}
        >
          {/* Deliberately NOT flex-1. When the text absorbed the spare
              width, the fan was shoved against the CTA at the far right
              with a lake of empty gradient after the sentence. Sized to
              its content instead, so count → sentence → fan read as one
              left-hand cluster and the CTA takes the far side alone. */}
          <div className="min-w-0 lg:flex lg:items-center lg:gap-5">
            {/* The eyebrow is the label only while the count stands
                alone; from lg it moves beside the number as a real
                sentence, so the band never repeats itself. */}
            <p className="text-[0.8125rem] font-semibold tracking-wide text-white/75 uppercase lg:hidden">
              Ready to review
            </p>
            <p className="mt-1 flex shrink-0 items-baseline gap-2 text-white lg:mt-0">
              <span className="text-[3rem] leading-none font-bold tracking-tight sm:text-[4rem] lg:text-[3.5rem]">
                {totalDue}
              </span>
              <span className="text-[1.125rem] font-medium lg:hidden">
                card{totalDue === 1 ? "" : "s"}
              </span>
            </p>
            <div className="min-w-0">
              <p className="hidden text-[1.0625rem] font-semibold text-white lg:block">
                card{totalDue === 1 ? "" : "s"} ready to review
              </p>
              <p className="mt-1 text-[0.9375rem] text-white/80 lg:mt-0">
                {wordsDue > 0 && sentencesDue > 0
                  ? `${wordsDue} word${wordsDue === 1 ? "" : "s"} and ${sentencesDue} sentence${sentencesDue === 1 ? "" : "s"} waiting.`
                  : wordsDue > 0
                    ? "Swipe through them — spaced repetition handles the rest."
                    : "Fill the blanks — the context check."}
              </p>
            </div>
          </div>
          {/* THE DECKS THEMSELVES, fanned — and each one is a real link
              straight into that deck. A count tells you how MUCH work is
              waiting; the covers tell you what the work IS, in the same
              artwork the learner recognises from the shelf below. Real
              decks, never a decorative stack: something that looks this
              much like a card is going to get clicked, and a picture
              that doesn't respond is a broken promise.
              Hover pulls the card straight, lifts it and brings it to
              the front, so a fan of overlapping covers stays readable
              while you point at one.
              `lg:ml-auto` on the fan takes ALL the spare width, so the
              stack rides to the right end next to the CTA; the CTA's own
              `lg:ml-10` then holds an explicit 72px (gap-8 + 40px) of
              air between them, enough that a hovered card can lift and
              scale without reaching the button. Splitting the slack
              between two auto margins was tried and left the fan
              stranded mid-band.
              Desktop only: on a phone the band is already a stack and
              this would push the CTA below the fold. */}
          {duePreview.length > 0 && (
            <div className="home-spotlight-fan hidden shrink-0 items-center lg:ml-auto lg:flex">
              {duePreview.map((pick, index) => (
                <Link
                  key={pick.key}
                  href={pick.href}
                  aria-label={`Review ${pick.name} — ${pick.detail}`}
                  // Rotation and depth ride CSS VARIABLES rather than an
                  // inline `transform`/`z-index`: inline styles outrank
                  // utilities, so a hover class could never have undone
                  // them. As variables, the hover utilities compose.
                  style={
                    {
                      marginLeft: index === 0 ? 0 : "-2.25rem",
                      "--fan-rotate": `${(index - (duePreview.length - 1) / 2) * 7}deg`,
                      "--fan-z": index,
                    } as React.CSSProperties
                  }
                  className="w-24 shrink-0 overflow-hidden rounded-lg shadow-[0_8px_20px_rgba(0,0,0,0.35)] ring-1 ring-white/20 transition duration-200 z-[var(--fan-z)] rotate-[var(--fan-rotate)] hover:z-20 hover:-translate-y-2 hover:rotate-0 hover:scale-105 hover:ring-white/50 focus-visible:z-20 focus-visible:-translate-y-2 focus-visible:rotate-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <CollectionCover art={pick.art} name={pick.name} />
                </Link>
              ))}
            </div>
          )}

          <Link
            href={wordsDue > 0 ? "/decks?book=all" : "/decks?sentences=all"}
            className="home-spotlight-cta inline-flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-full bg-white px-6 text-[1rem] font-semibold text-neutral-900 shadow-sm transition-transform hover:scale-[1.02] lg:ml-10 lg:pr-7 lg:pl-6"
          >
            <Play className="size-5 fill-current" />
            Start reviewing
          </Link>
        </section>
      )}

      {/* No width cap: shelves take the page. See `Shelf`. */}
      <div className="space-y-10">
        {picks.length > 0 && (
          <Shelf
            title={totalDue > 0 ? "Waiting for you" : "Your library"}
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
                cover={<CollectionCover art={pick.art} name={pick.name} />}
              />
            ))}
          </Shelf>
        )}

        {/* ROW 2 — SENTENCE DECKS. Its own shelf, right under the word
            decks, because the two card types are the two halves of the
            same loop: what a word means, and whether you can still
            supply it when a sentence needs it. */}
        {sentenceDecks.length > 0 && (
          <Shelf
            title="Sentence decks"
            seeAllHref="/sentences"
            className="home-sentence-decks"
          >
            {sentenceDecks.map((deck) => (
              <ShelfCard
                key={deck.key}
                href={deck.href}
                name={deck.name}
                detail={deck.detail}
                badge={deck.playable ? deck.detail : undefined}
                playable={deck.playable}
                cover={<CollectionCover art={deck.art} name={deck.name} />}
              />
            ))}
          </Shelf>
        )}

        {/* ROW 3 — RECOMMENDED SENTENCES. Books with words and no cards
            yet: the one press that turns a pile of vocabulary into the
            context check. Same rule as the official-book row below — a
            recommendation has to be able to say why it is here. */}
        {sentenceCandidates.length > 0 && (
          <Shelf
            title="Turn these into sentences"
            seeAllHref="/sentences"
            className="home-sentence-suggestions"
          >
            {sentenceCandidates.map((book) => (
              <ShelfCard
                key={`make-${book.id}`}
                href="/sentences"
                name={book.name}
                detail={`${book.wordCount} word${book.wordCount === 1 ? "" : "s"} · no cards yet`}
                cover={<CollectionCover art="book" name={book.name} />}
              />
            ))}
          </Shelf>
        )}

        {/* ROW 4 — what they might want next, and it can say WHY. No
            model: official books in a language they already study, minus
            what they already own. An unexplained recommendation is just
            an advert. */}
        {recommended.length > 0 && (
          <Shelf
            title={recommendedReason}
            seeAllHref="/official"
            className="home-recommended"
          >
            {recommended.map((pack) => (
              <ShelfCard
                key={pack.id}
                href={`/official/${pack.slug}`}
                name={pack.name}
                detail={`${pack.itemCount} word${pack.itemCount === 1 ? "" : "s"}`}
                cover={
                  <PackCover
                    slug={pack.slug}
                    name={pack.name}
                    language={pack.language}
                  />
                }
              />
            ))}
          </Shelf>
        )}

        {/* ROW 5 — recents. Chats get generated tiles so this reads as a
            shelf rather than a text list wedged between two shelves. */}
        {recent.length > 0 && (
          <Shelf title="Pick a chat back up" className="home-chats">
            {recent.map((thread) => {
              const title = threadTitle(thread);
              return (
                <ShelfCard
                  key={thread.id}
                  href={`/chat?t=${thread.id}`}
                  name={title}
                  detail={thread.language ?? "Chat"}
                  cover={<ChatTile title={title} />}
                />
              );
            })}
          </Shelf>
        )}

        {/* ROW 6 — the whole catalog, for when none of the above was it.
            Inside the same stack as the rest: it used to sit outside and
            carry its own spacing, which is how it ended up the one row
            with a different width. */}
        <OfficialShelf items={officialRows} />
      </div>
    </PageShell>
  );
}
