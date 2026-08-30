import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Globe, CalendarDays } from "lucide-react";
import { requireLearner } from "@/lib/auth";
import { listDirectoryTutors } from "@/lib/tutor-queries";
import { formatMoney } from "@/lib/tutor-pricing";
import { TutorAvatar } from "@/components/study/tutor-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Tutors" };

/**
 * THE TUTOR DIRECTORY — a pilot, and shaped like one.
 *
 * This is the first place the two halves of the app meet: the teacher
 * workspace has had a schedule, a lesson loop and a student record since
 * the beginning, and the learner has had no way to reach a human being.
 *
 * What it deliberately is NOT is a marketplace. There are no ratings, no
 * ranking, no "top rated near you", no review count to farm — those are
 * the machinery of a two-sided market with density, and this is a
 * handful of tutors we picked. Adding the machinery early would be
 * pretending to a scale we do not have, and it is what turns a tutor
 * directory into a race to the bottom on price. The order is simply the
 * order they joined.
 *
 * Rows, not a grid of cards: a row can hold the two facts that actually
 * decide a booking — what they teach and what it costs — at a size you
 * can scan, and it works identically on a phone.
 */
export default async function TutorsPage({
  searchParams,
}: {
  searchParams: Promise<{ language?: string }>;
}) {
  await requireLearner();
  const { language } = await searchParams;
  const tutors = await listDirectoryTutors(language);

  // Facets come from the tutors who ARE listed, never from a fixed list:
  // a filter that offers a language nobody teaches is a dead end with a
  // confident label on it.
  const allTutors = language ? await listDirectoryTutors() : tutors;
  const languages = [
    ...new Set(allTutors.flatMap((t) => t.languages)),
  ].sort();

  return (
    <PageShell>
      <PageHeader
        icon={GraduationCap}
        title="Book a tutor"
        subtitle="A small group of teachers we work with directly. Pick a time, say what you want to work on, and it lands on their calendar."
        actions={
          <Link
            href="/tutors/bookings"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-surface px-3.5 text-[0.9375rem] font-medium shadow-card transition-colors hover:bg-surface-hover"
          >
            <CalendarDays className="size-4 text-fg-tertiary" />
            Your lessons
          </Link>
        }
      />

      {languages.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <FilterChip href="/tutors" active={!language}>
            All
          </FilterChip>
          {languages.map((lang) => (
            <FilterChip
              key={lang}
              href={`/tutors?language=${encodeURIComponent(lang)}`}
              active={language === lang}
            >
              {lang}
            </FilterChip>
          ))}
        </div>
      )}

      {tutors.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title={
            language ? `No tutors teaching ${language} yet` : "No tutors yet"
          }
          description="The pilot is a small group and it grows one teacher at a time. Everything else in the app works without one."
        />
      ) : (
        <ul className="tutor-list max-w-3xl divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card">
          {tutors.map((tutor) => (
            <li key={tutor.id} className="tutor-row group">
              <Link
                href={`/tutors/${tutor.id}`}
                className="flex items-center gap-3.5 px-3 py-3.5 transition-colors hover:bg-surface-hover sm:px-4"
              >
                <TutorAvatar name={tutor.name} className="w-12 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-semibold">
                    {tutor.name}
                  </span>
                  <span className="block truncate text-[0.875rem] text-fg-secondary">
                    {tutor.headline}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-fg-tertiary">
                    <span>{tutor.languages.join(" · ")}</span>
                    {tutor.country && (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="size-3" />
                        {tutor.country}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[0.9375rem] font-semibold">
                    {formatMoney(tutor.rateCents, tutor.currency)}
                  </span>
                  <span className="block text-[0.75rem] text-fg-tertiary">
                    {tutor.lessonMinutes} min
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-accent px-3 py-1.5 text-[0.875rem] font-medium text-white"
          : "rounded-full bg-surface px-3 py-1.5 text-[0.875rem] text-fg-secondary shadow-card transition-colors hover:bg-surface-hover"
      }
    >
      {children}
    </Link>
  );
}
