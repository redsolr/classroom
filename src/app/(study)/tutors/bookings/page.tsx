import type { Metadata } from "next";
import { CalendarDays, Receipt } from "lucide-react";
import { requireLearner } from "@/lib/auth";
import { learnerBookings, learnerPayments } from "@/lib/tutor-queries";
import { formatMoney } from "@/lib/tutor-pricing";
import { cancelTutorBooking } from "@/lib/actions/tutors";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  BackLink,
  Card,
  CardHeader,
  PageHeader,
  PageShell,
} from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Your lessons" };

const STATUS_TONE = {
  confirmed: "success",
  completed: "neutral",
  cancelled: "danger",
  pending_payment: "warning",
} as const;

function when(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * THE LEARNER'S SIDE OF THE TRANSACTION — lessons and receipts.
 *
 * Both on one page because they are the same question asked twice: what
 * did I book, and what did I pay for it. Splitting them would mean
 * finding out you were charged for something on a different screen from
 * the thing you were charged for.
 *
 * The payment table shows the SPLIT, not just the total. A learner
 * seeing how much of their money reached the person who taught them is
 * unusual, and it is the whole reason the ledger stores every party's
 * share rather than one number: it lets us show this without deriving
 * anything, and without the figures drifting when our commission
 * changes.
 */
export default async function LearnerBookingsPage() {
  const learner = await requireLearner();
  const [bookings, payments] = await Promise.all([
    learnerBookings(learner.id),
    learnerPayments(learner.id),
  ]);

  const now = new Date();
  const upcoming = bookings.filter(
    (row) => row.booking.status === "confirmed" && row.booking.startsAt > now,
  );
  const past = bookings.filter((row) => !upcoming.includes(row));

  return (
    <PageShell>
      <BackLink href="/tutors">Tutors</BackLink>
      <PageHeader
        icon={CalendarDays}
        title="Your lessons"
        subtitle="Lessons you've booked, and what you paid for them."
      />

      <div className="max-w-3xl space-y-5">
        {bookings.length === 0 && payments.length === 0 ? (
          <EmptyState
            icon={<CalendarDays />}
            title="No lessons yet"
            description="Book one from the tutor list — a person hears the things a model can't, especially what you avoid saying."
          />
        ) : null}

        {upcoming.length > 0 && (
          <Card>
            <CardHeader title="Coming up" />
            <ul className="divide-y divide-border">
              {upcoming.map(({ booking, tutorName, tutorEmail }) => (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem] font-semibold">
                      {when(booking.startsAt)}
                    </p>
                    <p className="text-[0.875rem] text-fg-secondary">
                      {tutorName ?? tutorEmail.split("@")[0]}
                      {booking.focus.length > 0 &&
                        ` · ${booking.focus.join(", ")}`}
                      {booking.plan === "recurring" && " · weekly"}
                    </p>
                  </div>
                  {/* Cancelling frees the tutor's calendar and records
                      what happened. It does NOT refund: a pilot with a
                      handful of tutors wants a human deciding that, not
                      a policy engine that makes a calendar worthless. */}
                  <form action={cancelTutorBooking.bind(null, booking.id)}>
                    <SubmitButton variant="ghost">Cancel</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {past.length > 0 && (
          <Card>
            <CardHeader title="Past lessons" />
            <ul className="divide-y divide-border">
              {past.map(({ booking, tutorName, tutorEmail }) => (
                <li
                  key={booking.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem]">
                      {when(booking.startsAt)}
                    </p>
                    <p className="text-[0.875rem] text-fg-tertiary">
                      {tutorName ?? tutorEmail.split("@")[0]}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[booking.status]}>
                    {booking.status === "pending_payment"
                      ? "unpaid"
                      : booking.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {payments.length > 0 && (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Receipt className="size-4 text-fg-tertiary" />
                  Payments
                </span>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-[0.875rem]">
                <thead>
                  <tr className="border-b border-border text-left text-[0.78rem] text-fg-tertiary">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Tutor</th>
                    <th className="px-4 py-2 text-right font-medium">
                      You paid
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      Tutor received
                    </th>
                    <th className="px-4 py-2 text-center font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(({ payment, tutorName, tutorEmail }) => (
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
                      <td className="px-4 py-2.5">
                        {tutorName ?? tutorEmail.split("@")[0]}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                        {formatMoney(payment.grossCents, payment.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-fg-secondary">
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
            <p className="border-t border-border px-4 py-2.5 text-[0.8125rem] text-fg-tertiary">
              The difference is Classroom&rsquo;s share, which also covers
              the card processing fee.
            </p>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
