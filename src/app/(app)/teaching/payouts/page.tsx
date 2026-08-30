import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { BadgeCheck, Banknote, CalendarRange, TriangleAlert } from "lucide-react";
import { db, tutorAvailability, tutorProfiles } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { teacherEarnings, teacherPayments } from "@/lib/tutor-queries";
import {
  formatMoney,
  PLATFORM_FEE_PERCENT,
  RECURRING_DISCOUNT_PERCENT,
} from "@/lib/tutor-pricing";
import { connectConfigured } from "@/lib/tutor-billing";
import {
  addTutorAvailability,
  openPayoutDashboard,
  refreshPayoutStatus,
  removeTutorAvailability,
  saveTutorProfile,
  setTutorListed,
  startPayoutOnboarding,
} from "@/lib/actions/tutors";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  PageHeader,
  PageShell,
} from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Teaching & payouts" };

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * THE TUTOR'S SIDE — listing, hours, payouts, earnings.
 *
 * One page, in the order a tutor moves through it: who you are, when you
 * teach, how you get paid, then what you have earned. Splitting these
 * across four settings screens would hide the dependency that actually
 * matters — you cannot be listed until Stripe says you can be paid — and
 * that rule is easier to accept when you can see the whole chain.
 *
 * The earnings figure is EXACT and it is not an estimate at any point.
 * That is the reason the platform absorbs Stripe's processing fee rather
 * than passing it through (see lib/tutor-pricing.ts): Stripe's fee is
 * unknown until settlement, and a tutor should never have to wonder what
 * they earned. What is provisional here is our own margin, and it is
 * labelled that way on our side, not theirs.
 */
export default async function TeachingPayoutsPage() {
  const teacher = await requireTeacher();

  const [profile, hours, earnings, payments] = await Promise.all([
    db.query.tutorProfiles.findFirst({
      where: eq(tutorProfiles.teacherId, teacher.id),
    }),
    db
      .select()
      .from(tutorAvailability)
      .where(eq(tutorAvailability.teacherId, teacher.id))
      .orderBy(asc(tutorAvailability.weekday), asc(tutorAvailability.startMinute)),
    teacherEarnings(teacher.id),
    teacherPayments(teacher.id),
  ]);

  const listed = profile?.status === "listed";
  const currency = profile?.currency ?? "usd";

  return (
    <PageShell>
      <PageHeader
        icon={Banknote}
        title="Teaching & payouts"
        subtitle="Take bookings from learners using Classroom, and get paid for them."
        actions={
          profile && (
            <form
              action={setTutorListed.bind(null, !listed)}
              // Losing payouts un-lists automatically; this is the
              // deliberate version of the same switch.
            >
              <SubmitButton variant={listed ? "ghost" : "primary"}>
                {listed ? "Pause my listing" : "List me"}
              </SubmitButton>
            </form>
          )
        }
      />

      <div className="max-w-3xl space-y-5">
        {!connectConfigured() && (
          <Card className="flex gap-2.5 px-4 py-3.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-[0.875rem] text-fg-secondary">
              Payouts aren&rsquo;t configured on this deployment, so
              bookings are switched off entirely. That&rsquo;s deliberate:
              a learner must never be able to pay for a lesson we
              can&rsquo;t pay you for.
            </p>
          </Card>
        )}

        {/* ── 1. Who you are ─────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Your listing"
            actions={
              listed ? (
                <Badge tone="success">Listed</Badge>
              ) : (
                <Badge tone="neutral">{profile ? "Paused" : "Not set up"}</Badge>
              )
            }
          />
          <form action={saveTutorProfile} className="space-y-4 px-4 py-4">
            <Field label="Headline">
              <Input
                id="headline"
                name="headline"
                required
                maxLength={120}
                defaultValue={profile?.headline ?? ""}
                placeholder="Conversational Japanese for people who freeze up"
              />
            </Field>

            <Field label="About you">
              <Textarea
                id="bio"
                name="bio"
                rows={4}
                defaultValue={profile?.bio ?? ""}
                placeholder="How you teach, who you're best for, what a lesson with you is actually like."
              />
            </Field>

            <Field label="Languages you teach">
              {/* Multi-select rather than free text: the directory's
                  language filter is built from these values, and a
                  free-text "japanese " would silently become its own
                  facet with one tutor in it. */}
              <select
                id="languages"
                name="languages"
                multiple
                required
                size={5}
                defaultValue={profile?.languages ?? []}
                className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-[0.9375rem]"
              >
                {STUDY_LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Country"
                hint="Two-letter code. Stripe needs it and can't change it later."
              >
                <Input
                  id="country"
                  name="country"
                  required
                  maxLength={2}
                  defaultValue={profile?.country ?? ""}
                  placeholder="TH"
                />
              </Field>
              <Field
                label="Your timezone"
                hint="Your hours are stored in it, so learners see the right times wherever they are."
              >
                <Input
                  id="timezone"
                  name="timezone"
                  required
                  defaultValue={
                    profile?.timezone ?? teacher.timezone ?? "Asia/Bangkok"
                  }
                  placeholder="Asia/Bangkok"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Price per lesson">
                <Input
                  id="rate"
                  name="rate"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  defaultValue={
                    profile ? (profile.rateCents / 100).toFixed(2) : ""
                  }
                />
              </Field>
              <Field label="Currency">
                <Select
                  id="currency"
                  name="currency"
                  defaultValue={currency}
                >
                  <option value="usd">USD</option>
                  <option value="eur">EUR</option>
                  <option value="gbp">GBP</option>
                  <option value="thb">THB</option>
                </Select>
              </Field>
              <Field label="Lesson length">
                <Select
                  id="lessonMinutes"
                  name="lessonMinutes"
                  defaultValue={String(profile?.lessonMinutes ?? 50)}
                >
                  <option value="30">30 minutes</option>
                  <option value="50">50 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                </Select>
              </Field>
            </div>

            <SubmitButton>Save listing</SubmitButton>
          </form>
        </Card>

        {/* ── 2. When you teach ──────────────────────────────────── */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CalendarRange className="size-4 text-fg-tertiary" />
                Your weekly hours
              </span>
            }
          />
          <div className="px-4 py-4">
            <p className="mb-3 text-[0.875rem] text-fg-secondary">
              Windows in <strong>your</strong> timezone. Learners see them
              as slots in theirs, split into{" "}
              {profile?.lessonMinutes ?? 50}-minute lessons.
            </p>

            {hours.length > 0 && (
              <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
                {hours.map((window) => (
                  <li
                    key={window.id}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <span className="flex-1 text-[0.9375rem]">
                      {WEEKDAYS[window.weekday]} ·{" "}
                      {hhmm(window.startMinute)}–{hhmm(window.endMinute)}
                    </span>
                    <form
                      action={removeTutorAvailability.bind(null, window.id)}
                    >
                      <SubmitButton variant="ghost" size="sm">
                        Remove
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <form
              action={addTutorAvailability}
              className="flex flex-wrap items-end gap-3"
            >
              <Field label="Day" className="min-w-36">
                <Select id="weekday" name="weekday" defaultValue="1">
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="From">
                <Input id="start" name="start" type="time" defaultValue="09:00" required />
              </Field>
              <Field label="To">
                <Input id="end" name="end" type="time" defaultValue="12:00" required />
              </Field>
              <SubmitButton>Add window</SubmitButton>
            </form>
          </div>
        </Card>

        {/* ── 3. Getting paid ────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Payouts"
            actions={
              profile?.payoutsEnabled ? (
                <Badge tone="success">
                  <BadgeCheck className="size-3" />
                  Ready
                </Badge>
              ) : (
                <Badge tone="warning">Not ready</Badge>
              )
            }
          />
          <div className="space-y-3 px-4 py-4">
            <p className="text-[0.875rem] text-fg-secondary">
              Money goes straight to your own Stripe account — it never
              sits with us. Stripe handles the identity checks and your
              payout schedule, so we never see or store your bank details.
            </p>
            <p className="text-[0.875rem] text-fg-secondary">
              You keep <strong>{100 - PLATFORM_FEE_PERCENT}%</strong> of
              every lesson. Our {PLATFORM_FEE_PERCENT}% covers the
              platform <em>and</em> the card processing fee — we pay
              Stripe out of our share rather than taking it out of yours,
              so the number you see below is exactly what you got, not an
              estimate that settles later.
            </p>

            <div className="flex flex-wrap gap-2">
              {profile && (
                <form action={refreshPayoutStatus}>
                  <SubmitButton variant="secondary">
                    {profile.stripeAccountId
                      ? "Re-check my payout status"
                      : "Check status"}
                  </SubmitButton>
                </form>
              )}
              {profile?.stripeAccountId && profile.payoutsEnabled && (
                <form action={openPayoutDashboard}>
                  <SubmitButton variant="secondary">
                    Open my Stripe dashboard
                  </SubmitButton>
                </form>
              )}
            </div>

            {profile && !profile.payoutsEnabled && (
              <PayoutOnboardingButton hasAccount={Boolean(profile.stripeAccountId)} />
            )}
            {!profile && (
              <p className="text-[0.875rem] text-fg-tertiary">
                Save your listing first — Stripe needs your country before
                an account can be created.
              </p>
            )}
          </div>
        </Card>

        {/* ── 4. What you've earned ──────────────────────────────── */}
        <Card>
          <CardHeader title="Earnings" />
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
            <Stat
              label="Paid to you"
              value={formatMoney(earnings.netCents, currency)}
            />
            <Stat
              label="Learners paid"
              value={formatMoney(earnings.grossCents, currency)}
            />
            <Stat label="Lessons" value={String(earnings.lessons)} />
          </div>

          {payments.length === 0 ? (
            <p className="px-4 py-4 text-[0.875rem] text-fg-tertiary">
              No payments yet. They appear here the moment a booking is
              paid for — before the lesson happens.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.875rem]">
                <thead>
                  <tr className="border-b border-border text-left text-[0.78rem] text-fg-tertiary">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Lesson</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Learner paid
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      Your share
                    </th>
                    <th className="px-4 py-2 text-center font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(({ payment, startsAt }) => (
                    <tr
                      key={payment.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {new Intl.DateTimeFormat(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(payment.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-fg-secondary">
                        {startsAt
                          ? new Intl.DateTimeFormat(undefined, {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(startsAt)
                          : "Weekly plan"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-fg-secondary">
                        {formatMoney(payment.grossCents, payment.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                        {formatMoney(payment.tutorNetCents, payment.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge
                          tone={
                            payment.status === "succeeded"
                              ? "success"
                              : payment.status === "refunded"
                                ? "info"
                                : payment.status === "failed"
                                  ? "danger"
                                  : "warning"
                          }
                        >
                          {payment.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="border-t border-border px-4 py-2.5 text-[0.8125rem] text-fg-tertiary">
            Learners who book you every week pay{" "}
            {RECURRING_DISCOUNT_PERCENT}% less per lesson — the discount
            comes out of the whole price, so your share of it is the same{" "}
            {100 - PLATFORM_FEE_PERCENT}%.
          </p>
        </Card>
      </div>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-[0.8125rem] text-fg-tertiary">{label}</p>
      <p className="mt-1 text-[1.25rem] leading-none font-semibold tracking-tight">
        {value}
      </p>
    </div>
  );
}

/** The onboarding link is minted per click — Stripe's account links
 * expire in minutes, so a stored one is a support ticket waiting to
 * happen. See the action for the account-creation half. */
function PayoutOnboardingButton({ hasAccount }: { hasAccount: boolean }) {
  return (
    <form action={startPayoutOnboarding}>
      <SubmitButton>
        {hasAccount ? "Finish payout setup" : "Set up payouts with Stripe"}
      </SubmitButton>
    </form>
  );
}
