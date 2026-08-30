import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { Compass, GraduationCap } from "lucide-react";
import { db, studyPackItems, studyPacks, studyPaths, studyVocab } from "@/db";
import { requireLearner } from "@/lib/auth";
import { listDirectoryTutors } from "@/lib/tutor-queries";
import { formatMoney } from "@/lib/tutor-pricing";
import { SearchBar } from "@/components/study/search-bar";
import { PackCover } from "@/components/study/pack-cover";
import { Shelf, ShelfCard } from "@/components/study/shelf";
import { TutorAvatar } from "@/components/study/tutor-avatar";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Browse" };

/**
 * BROWSE — everything there is, arranged by the question you'd ask.
 *
 * Search answers "where is the thing I can name". This answers the other
 * half — "what is there" — which is the half a learner has when they
 * finish a book and do not yet know what to do next. Every streaming app
 * carries both surfaces for exactly this reason, and we shipped only the
 * first one.
 *
 * ORDER IS THE OPINION. Languages the learner already studies lead,
 * because their next book is almost certainly in one of them; then the
 * languages they don't, which is what makes this a place to discover
 * rather than a filter over what they already have; then the people, who
 * are the scarcest thing here and the reason the page is worth having at
 * all; then the guided paths.
 *
 * Where a country appears it is the TUTOR's, never a book's. There is no
 * honest way to say a vocabulary book is "from" a country — French is
 * not France's — and inventing that facet would make the page look
 * richer while telling the learner nothing true.
 */

/** Region groupings, for the "where in the world" cut of the tutor list.
 * Coarse on purpose: a pilot has a handful of tutors, and a facet with
 * one person behind it is a dead end with a confident label on it. */
const REGIONS: Record<string, string[]> = {
  Asia: ["TH", "JP", "KR", "CN", "VN", "SG", "MY", "PH", "ID", "IN"],
  Europe: ["FR", "DE", "ES", "IT", "GB", "PT", "NL", "PL", "SE", "IE"],
  Americas: ["US", "CA", "MX", "BR", "AR", "CL", "CO"],
  Oceania: ["AU", "NZ"],
};

function regionOf(country: string | null): string {
  if (!country) return "Elsewhere";
  const found = Object.entries(REGIONS).find(([, codes]) =>
    codes.includes(country.toUpperCase()),
  );
  return found?.[0] ?? "Elsewhere";
}

export default async function BrowsePage() {
  const learner = await requireLearner();

  const [packs, tutors, paths, studiedRows] = await Promise.all([
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
    listDirectoryTutors(),
    db.select().from(studyPaths).orderBy(asc(studyPaths.position)),
    db
      .selectDistinct({ language: studyVocab.language })
      .from(studyVocab)
      .where(eq(studyVocab.learnerId, learner.id)),
  ]);

  const studied = new Set(studiedRows.map((r) => r.language));

  const byLanguage = new Map<string, typeof packs>();
  for (const pack of packs) {
    const bucket = byLanguage.get(pack.language);
    if (bucket) bucket.push(pack);
    else byLanguage.set(pack.language, [pack]);
  }

  // Languages they study first — their next book is almost certainly in
  // one of them — then the rest, alphabetically.
  const languages = [...byLanguage.keys()].sort((a, b) => {
    const rank = (l: string) => (studied.has(l) ? 0 : 1);
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  const tutorsByRegion = new Map<string, typeof tutors>();
  for (const tutor of tutors) {
    const region = regionOf(tutor.country);
    const bucket = tutorsByRegion.get(region);
    if (bucket) bucket.push(tutor);
    else tutorsByRegion.set(region, [tutor]);
  }

  return (
    <PageShell width="wide">
      <div className="mb-4 lg:hidden">
        <SearchBar />
      </div>
      <PageHeader
        icon={Compass}
        title="Browse"
        subtitle="Everything there is — books by language, the people who teach them, and the guided orders."
      />

      <div className="space-y-10">
        {languages.map((language) => (
          <Shelf
            key={language}
            title={language}
            subtitle={
              studied.has(language)
                ? "You're already learning this"
                : undefined
            }
            seeAllHref="/official"
            className={`browse-language browse-language-${language.toLowerCase()}`}
          >
            {(byLanguage.get(language) ?? []).map((pack) => (
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
        ))}

        {/* THE PEOPLE — grouped by where they are, because "who can teach
            me at a time that works" is really a question about where
            they live. Rows rather than cover art: a person is not a
            product, and a circular tile with a name reads as one. */}
        {tutors.length > 0 && (
          <section className="browse-tutors">
            <h2 className="mb-3 text-[1.5rem] font-bold tracking-tight">
              Tutors
            </h2>
            <div className="space-y-5">
              {[...tutorsByRegion.entries()].map(([region, group]) => (
                <div key={region}>
                  <h3 className="mb-2 text-[0.875rem] font-medium text-fg-secondary">
                    {region}
                  </h3>
                  <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card">
                    {group.map((tutor) => (
                      <li key={tutor.id}>
                        <Link
                          href={`/tutors/${tutor.id}`}
                          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                        >
                          <TutorAvatar
                            name={tutor.name}
                            className="w-10 shrink-0"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.9375rem] font-semibold">
                              {tutor.name}
                            </span>
                            <span className="block truncate text-[0.8125rem] text-fg-tertiary">
                              {tutor.languages.join(" · ")}
                              {tutor.country && ` · ${tutor.country}`}
                            </span>
                          </span>
                          <span className="shrink-0 text-[0.875rem] font-medium tabular-nums">
                            {formatMoney(tutor.rateCents, tutor.currency)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {paths.length > 0 && (
          <section className="browse-paths">
            <h2 className="mb-3 text-[1.5rem] font-bold tracking-tight">
              Guided paths
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card">
              {paths.map((path) => (
                <li key={path.id}>
                  <Link
                    href={`/path/${path.slug}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                      <GraduationCap className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-semibold">
                        {path.name}
                      </span>
                      <span className="block truncate text-[0.8125rem] text-fg-tertiary">
                        {path.language}
                        {path.description && ` · ${path.description}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageShell>
  );
}
