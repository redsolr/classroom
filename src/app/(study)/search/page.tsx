import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, ilike, or } from "drizzle-orm";
import { Search } from "lucide-react";
import {
  db,
  studyPackItems,
  studyPacks,
  studySentences,
  studyThreads,
  studyVocab,
  studyDecks,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { clozeToPlain } from "@/lib/cloze";
import { escapeLike } from "@/lib/sql-like";
import { threadTitle } from "@/lib/study-display";
import { SearchBar } from "@/components/study/search-bar";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Search" };

/** Per group. Search is for finding one thing, not for browsing — the
 * section pages are where "all of them" lives. */
const LIMIT = 8;


/**
 * SEARCH — one field over everything the learner has, plus the catalog.
 *
 * Five groups, and the order is what a learner most likely meant:
 *
 *   words      — the dictionary case. "What was that word again?" The
 *                answer is READ here, not navigated to, so the row shows
 *                reading + meaning inline rather than being a bare link.
 *   sentences  — the same lookup over cloze cards, blanks filled in.
 *   books      — their own collections, by name.
 *   official   — matched by pack name AND by the words INSIDE it, which
 *                answers "where could I learn this word".
 *   chats      — by title.
 *
 * Everything learner-owned is scoped by `learnerId` in the WHERE clause;
 * the catalog is global content and deliberately isn't.
 */
export default async function StudySearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const learner = await requireLearner();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (!query) {
    return (
      <PageShell>
        <PageHeader
          icon={Search}
          title="Search"
          subtitle="Words, books, sentences, official books, chats."
        />
        {/* Phones only: at lg the pinned bar holds the field and carries
            the query, so a second one is the same control twice. */}
        <div className="lg:hidden">
          <SearchBar autoFocus />
        </div>
      </PageShell>
    );
  }

  const like = `%${escapeLike(query)}%`;

  const [words, sentences, books, packsByName, packsByWord, chats] =
    await Promise.all([
      db
        .select({
          id: studyVocab.id,
          term: studyVocab.term,
          reading: studyVocab.reading,
          meaning: studyVocab.meaning,
          language: studyVocab.language,
        })
        .from(studyVocab)
        .where(
          and(
            eq(studyVocab.learnerId, learner.id),
            or(
              ilike(studyVocab.term, like),
              ilike(studyVocab.reading, like),
              ilike(studyVocab.meaning, like),
            ),
          ),
        )
        .limit(LIMIT),
      db
        .select({
          id: studySentences.id,
          text: studySentences.text,
          translation: studySentences.translation,
        })
        .from(studySentences)
        .where(
          and(
            eq(studySentences.learnerId, learner.id),
            or(
              ilike(studySentences.text, like),
              ilike(studySentences.translation, like),
            ),
          ),
        )
        .limit(LIMIT),
      db
        .select({ id: studyDecks.id, name: studyDecks.name })
        .from(studyDecks)
        .where(
          and(
            eq(studyDecks.learnerId, learner.id),
            ilike(studyDecks.name, like),
          ),
        )
        .limit(LIMIT),
      db
        .select({
          id: studyPacks.id,
          slug: studyPacks.slug,
          name: studyPacks.name,
          language: studyPacks.language,
        })
        .from(studyPacks)
        .where(or(ilike(studyPacks.name, like), ilike(studyPacks.description, like)))
        .limit(LIMIT),
      // The useful half: find the official book that TEACHES a word, not
      // just the ones whose title happens to contain it.
      db
        .selectDistinctOn([studyPacks.id], {
          id: studyPacks.id,
          slug: studyPacks.slug,
          name: studyPacks.name,
          language: studyPacks.language,
          term: studyPackItems.term,
        })
        .from(studyPackItems)
        .innerJoin(studyPacks, eq(studyPackItems.packId, studyPacks.id))
        .where(
          or(
            ilike(studyPackItems.term, like),
            ilike(studyPackItems.meaning, like),
            ilike(studyPackItems.reading, like),
          ),
        )
        .limit(LIMIT),
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
            ilike(studyThreads.title, like),
          ),
        )
        .limit(LIMIT),
    ]);

  // A pack matched by name shouldn't repeat under "teaches this word".
  const namedPackIds = new Set(packsByName.map((p) => p.id));
  const teaching = packsByWord.filter((p) => !namedPackIds.has(p.id));

  const total =
    words.length +
    sentences.length +
    books.length +
    packsByName.length +
    teaching.length +
    chats.length;

  return (
    <PageShell>
      <PageHeader
        icon={Search}
        title="Search"
        subtitle={
          total === 0
            ? `Nothing matches “${query}”.`
            : `${total} result${total === 1 ? "" : "s"} for “${query}”.`
        }
      />
      <div className="lg:hidden">
        <SearchBar defaultValue={query} />
      </div>

      <div className="max-w-3xl space-y-8">
        {words.length > 0 && (
          <ResultGroup title="Words" href="/decks/all" hrefLabel="All words">
            {words.map((word) => (
              <ResultRow
                key={word.id}
                href="/decks/all"
                title={word.term}
                // The meaning IS the answer for a dictionary lookup —
                // it's shown, not hidden behind the click.
                detail={[word.reading, word.meaning]
                  .filter(Boolean)
                  .join(" — ")}
                aside={word.language}
              />
            ))}
          </ResultGroup>
        )}

        {sentences.length > 0 && (
          <ResultGroup title="Sentences" href="/sentences" hrefLabel="All sentences">
            {sentences.map((sentence) => (
              <ResultRow
                key={sentence.id}
                href="/sentences"
                title={clozeToPlain(sentence.text)}
                detail={sentence.translation ?? ""}
              />
            ))}
          </ResultGroup>
        )}

        {books.length > 0 && (
          <ResultGroup title="Your books" href="/books" hrefLabel="All books">
            {books.map((book) => (
              <ResultRow
                key={book.id}
                href={`/decks/${book.id}`}
                title={book.name}
                detail=""
              />
            ))}
          </ResultGroup>
        )}

        {packsByName.length > 0 && (
          <ResultGroup title="Official books" href="/official" hrefLabel="All official">
            {packsByName.map((pack) => (
              <ResultRow
                key={pack.id}
                href={`/official/${pack.slug}`}
                title={pack.name}
                detail=""
                aside={pack.language}
              />
            ))}
          </ResultGroup>
        )}

        {teaching.length > 0 && (
          <ResultGroup title="Official books that teach this">
            {teaching.map((pack) => (
              <ResultRow
                key={pack.id}
                href={`/official/${pack.slug}`}
                title={pack.name}
                detail={`teaches “${pack.term}”`}
                aside={pack.language}
              />
            ))}
          </ResultGroup>
        )}

        {chats.length > 0 && (
          <ResultGroup title="Chats">
            {chats.map((thread) => (
              <ResultRow
                key={thread.id}
                href={`/chat?t=${thread.id}`}
                title={threadTitle(thread)}
                detail=""
              />
            ))}
          </ResultGroup>
        )}

        {total === 0 && (
          <p className="text-[0.9375rem] text-fg-secondary">
            Search looks through your words, sentences, books and chats, and
            the official catalog — including the words inside each official
            book, so you can find where something is taught.
          </p>
        )}
      </div>
    </PageShell>
  );
}

function ResultGroup({
  title,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="search-group">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[1.125rem] font-semibold">{title}</h2>
        {href && (
          <Link
            href={href}
            className="text-[0.875rem] font-medium text-accent-text hover:underline"
          >
            {hrefLabel}
          </Link>
        )}
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card">
        {children}
      </ul>
    </section>
  );
}

function ResultRow({
  href,
  title,
  detail,
  aside,
}: {
  href: string;
  title: string;
  detail: string;
  aside?: string;
}) {
  return (
    <li className="search-result">
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium">
            {title}
          </span>
          {detail && (
            <span className="block truncate text-[0.875rem] text-fg-secondary">
              {detail}
            </span>
          )}
        </span>
        {aside && (
          <span className="shrink-0 text-[0.78rem] text-fg-tertiary">
            {aside}
          </span>
        )}
      </Link>
    </li>
  );
}
