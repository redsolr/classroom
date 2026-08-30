import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Globe, Info } from "lucide-react";
import { requireLearner } from "@/lib/auth";
import {
  lastBookingPreferences,
  loadTutor,
} from "@/lib/tutor-queries";
import {
  formatMoney,
  recurringMonthlyPrice,
  RECURRING_DISCOUNT_PERCENT,
  splitLesson,
} from "@/lib/tutor-pricing";
import { LESSON_FOCUS_OPTIONS } from "@/lib/tutor-focus";
import { groupSlotsByDay } from "@/lib/tutor-slots";
import { BookingDialog } from "@/components/study/booking-dialog";
import { TutorAvatar } from "@/components/study/tutor-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { BackLink, Card, PageShell } from "@/components/ui/page-header";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ profileId: string }>;
}): Promise<Metadata> {
  const { profileId } = await params;
  const tutor = await loadTutor(profileId);
  return { title: tutor?.name ?? "Tutor" };
}

/**
 * ONE TUTOR — who they are, when they're free, what it costs.
 *
 * The slot grid is the page. Everything else is context for choosing
 * one, which is why the bio sits under the times rather than above them:
 * by the time someone opens this page they have already decided they
 * like the look of this tutor, and what they need next is whether the
 * hours work.
 *
 * Times render in the LEARNER's timezone automatically — the slots are
 * real instants (see lib/tutor-slots.ts), so the browser's own
 * formatting is the whole timezone story on this page.
 */
export default async function TutorPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const learner = await requireLearner();
  const { profileId } = await params;
  const tutor = await loadTutor(profileId);
  if (!tutor) notFound();

  const previous = await lastBookingPreferences(learner.id, tutor.teacherId);
  const split = splitLesson(tutor.rateCents);
  const monthly = recurringMonthlyPrice(tutor.rateCents, 4);
  const byDay = groupSlotsByDay(tutor.slots.filter((s) => !s.taken));

  const bookingTutor = {
    profileId: tutor.id,
    name: tutor.name,
    lessonMinutes: tutor.lessonMinutes,
    singlePrice: formatMoney(split.grossCents, tutor.currency),
    monthlyPrice: formatMoney(monthly, tutor.currency),
    discountPercent: RECURRING_DISCOUNT_PERCENT,
  };

  return (
    <PageShell>
      <BackLink href="/tutors">Tutors</BackLink>

      <header className="mb-6 flex flex-wrap items-start gap-4">
        <TutorAvatar name={tutor.name} className="w-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.625rem] font-semibold tracking-tight">
            {tutor.name}
          </h1>
          <p className="mt-1 text-[1rem] text-fg-secondary">
            {tutor.headline}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[0.875rem] text-fg-tertiary">
            <span>{tutor.languages.join(" · ")}</span>
            {tutor.country && (
              <span className="inline-flex items-center gap-1">
                <Globe className="size-3.5" />
                {tutor.country}
              </span>
            )}
            <span>{tutor.lessonMinutes}-minute lessons</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[1.5rem] leading-none font-semibold tracking-tight">
            {formatMoney(split.grossCents, tutor.currency)}
          </p>
          <p className="mt-1 text-[0.8125rem] text-fg-tertiary">per lesson</p>
        </div>
      </header>

      <div className="max-w-3xl space-y-6">
        <section>
          <h2 className="mb-3 text-[1.125rem] font-semibold">
            Pick a time
          </h2>
          {byDay.size === 0 ? (
            <EmptyState
              title="Nothing free in the next two weeks"
              description={`${tutor.name} is fully booked for now. Check back — slots open as lessons finish.`}
            />
          ) : (
            <div className="space-y-4">
              {[...byDay.entries()].map(([day, slots]) => (
                <div key={day}>
                  <h3 className="mb-2 text-[0.875rem] font-medium text-fg-secondary">
                    {new Intl.DateTimeFormat(undefined, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    }).format(slots[0].startsAt)}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((slot) => (
                      <BookingDialog
                        key={slot.startsAt.toISOString()}
                        tutor={bookingTutor}
                        slot={slot}
                        focusOptions={LESSON_FOCUS_OPTIONS}
                        defaultFocus={previous?.focus ?? []}
                        defaultNotes={previous?.notes ?? null}
                        label={new Intl.DateTimeFormat(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(slot.startsAt)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[0.8125rem] text-fg-tertiary">
                Times are shown in your own timezone.
              </p>
            </div>
          )}
        </section>

        {tutor.bio && (
          <section>
            <h2 className="mb-2 text-[1.125rem] font-semibold">About</h2>
            <p className="text-[0.9375rem] whitespace-pre-line text-fg-secondary">
              {tutor.bio}
            </p>
          </section>
        )}

        {/*
         * WHERE THE MONEY GOES, on the page where you decide to spend it.
         *
         * Most marketplaces show a price and say nothing else, and the
         * tutor finds out their cut on a statement. Both sides can read
         * this, it is the same arithmetic the ledger stores, and putting
         * it here rather than in a help article is the point: a learner
         * paying for a lesson should be able to see how much of it
         * reaches the person teaching it.
         */}
        <section>
          <h2 className="mb-2 text-[1.125rem] font-semibold">
            Where your money goes
          </h2>
          <Card className="divide-y divide-border">
            <SplitRow
              label={`${tutor.name} receives`}
              value={formatMoney(split.tutorNetCents, tutor.currency)}
              strong
            />
            <SplitRow
              label="Classroom's share"
              value={formatMoney(split.platformFeeCents, tutor.currency)}
              detail="Covers the platform and the card processing fee, which we pay out of this rather than taking it from the tutor."
            />
            <SplitRow
              label="You pay"
              value={formatMoney(split.grossCents, tutor.currency)}
              strong
            />
          </Card>
          <p className="mt-2 flex gap-1.5 text-[0.8125rem] text-fg-tertiary">
            <Info className="mt-px size-3.5 shrink-0" />
            Booking every week is {RECURRING_DISCOUNT_PERCENT}% cheaper —{" "}
            {formatMoney(monthly, tutor.currency)} a month for four lessons.
          </p>
        </section>
      </div>
    </PageShell>
  );
}

function SplitRow({
  label,
  value,
  detail,
  strong,
}: {
  label: string;
  value: string;
  detail?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p
          className={
            strong ? "text-[0.9375rem] font-semibold" : "text-[0.9375rem]"
          }
        >
          {label}
        </p>
        {detail && (
          <p className="mt-0.5 text-[0.8125rem] text-fg-tertiary">{detail}</p>
        )}
      </div>
      <p
        className={
          strong
            ? "shrink-0 text-[0.9375rem] font-semibold tabular-nums"
            : "shrink-0 text-[0.9375rem] tabular-nums text-fg-secondary"
        }
      >
        {value}
      </p>
    </div>
  );
}
