import type { TutorPayment } from "@/db";
import { formatMoney } from "@/lib/tutor-pricing";
import { Badge, type Tone } from "@/components/ui/badge";

/**
 * PAYMENT HISTORY — one table, both sides of the transaction.
 *
 * The learner's `/tutors/bookings` and the tutor's `/teaching/payouts`
 * shipped with near-identical copies of this: same columns, same
 * formatting, same status→tone ternary. Two copies of a money table is a
 * genuinely bad kind of duplication — the first divergence anybody
 * notices is the two parties reading different numbers for the same
 * payment, which is the one thing this feature cannot afford.
 *
 * What legitimately differs is the AUDIENCE, so that is the only prop:
 * the learner sees who they paid, the tutor sees which lesson it was
 * for, and each sees their own side of the split named in their own
 * words. Everything else — the arithmetic, the labels, the tone
 * mapping — is shared, because it is the same row in the same ledger.
 */

/**
 * Status → colour, ONCE. Pending is `warning` rather than neutral on
 * purpose: money that has not arrived is not a quiet state.
 */
export function paymentTone(status: TutorPayment["status"]): Tone {
  switch (status) {
    case "succeeded":
      return "success";
    case "refunded":
      return "info";
    case "failed":
      return "danger";
    case "pending":
      return "warning";
  }
}

export type PaymentRow = {
  payment: TutorPayment;
  /** The other party, or the lesson time — see `audience`. */
  context: string;
};

export function PaymentsTable({
  rows,
  audience,
}: {
  rows: PaymentRow[];
  audience: "learner" | "tutor";
}) {
  const learner = audience === "learner";

  return (
    <div className="payments-table overflow-x-auto">
      <table className="w-full text-[0.875rem]">
        <thead>
          <tr className="border-b border-border text-left text-[0.78rem] text-fg-tertiary">
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">
              {learner ? "Tutor" : "Lesson"}
            </th>
            <th className="px-4 py-2 text-right font-medium">
              {learner ? "You paid" : "Learner paid"}
            </th>
            <th className="px-4 py-2 text-right font-medium">
              {learner ? "Tutor received" : "Your share"}
            </th>
            <th className="px-4 py-2 text-center font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ payment, context }) => (
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
              <td className="px-4 py-2.5 text-fg-secondary">{context}</td>
              {/* The gross is emphasised for whoever it came OUT of, and
                  the net for whoever it went TO — each side's own number
                  is the one their eye should land on. */}
              <td
                className={
                  learner
                    ? "px-4 py-2.5 text-right font-medium tabular-nums"
                    : "px-4 py-2.5 text-right tabular-nums text-fg-secondary"
                }
              >
                {formatMoney(payment.grossCents, payment.currency)}
              </td>
              <td
                className={
                  learner
                    ? "px-4 py-2.5 text-right tabular-nums text-fg-secondary"
                    : "px-4 py-2.5 text-right font-medium tabular-nums"
                }
              >
                {formatMoney(payment.tutorNetCents, payment.currency)}
              </td>
              <td className="px-4 py-2.5 text-center">
                <Badge tone={paymentTone(payment.status)}>
                  {payment.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
