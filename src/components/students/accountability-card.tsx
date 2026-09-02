import {
  AlertTriangle,
  CalendarCheck,
  CircleSlash,
  MessageSquarePlus,
} from "lucide-react";
import type { AccountabilityWindow } from "@/lib/accountability";
import { openStudentThread } from "@/lib/actions/messages";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/page-header";

/**
 * DID THEY ACTUALLY DO THE WORK — for the tutor, before the lesson.
 *
 * The founder's reframing of the whole tutor role: the model already
 * teaches and explains well, and that is exactly what makes learners
 * lazy. What a person adds is noticing — that you have not opened the
 * app in eleven days, that you keep saving words and never drilling
 * them, that the same five words have beaten you four times.
 *
 * So this card leads with the uncomfortable numbers rather than the
 * flattering ones, and it phrases them as OBSERVATIONS a tutor can raise,
 * never as a verdict on the learner. "Studied on 3 of the last 14 days"
 * is a fact two people can talk about. "Not committed" is a label, and
 * the learner would be right to resent it.
 *
 * Everything here is the same evidence the learner sees on their own
 * progress page — deliberately, so the lesson starts from one shared set
 * of facts rather than two accounts of the same fortnight.
 */
export function AccountabilityCard({
  window: w,
  name,
  studentId,
}: {
  window: AccountabilityWindow;
  name: string;
  /** Enables the nudge — the card's one action, and the reason the card
   * exists at all. Without it this was a diagnosis with no mouth. */
  studentId: string;
}) {
  const firstName = name.split(" ")[0];
  const daysSince = w.daysSinceLastStudy;

  // The flags a tutor should actually open with. Ordered by how much a
  // conversation would help, not by severity — "you've stopped" beats
  // "your recall dipped".
  const flags: { icon: React.ReactNode; text: string }[] = [];
  if (daysSince === null) {
    flags.push({
      icon: <CircleSlash className="size-4" />,
      text: `${firstName} hasn't reviewed anything yet. Worth finding out whether the app is the problem or the habit is.`,
    });
  } else if (daysSince >= 7) {
    flags.push({
      icon: <AlertTriangle className="size-4" />,
      text: `${daysSince} days since the last review. Ask what got in the way before covering anything new.`,
    });
  }
  if (w.neverReviewed >= 20) {
    flags.push({
      icon: <AlertTriangle className="size-4" />,
      text: `${w.neverReviewed} saved words have never been reviewed once — collecting rather than learning, which looks like progress from the inside.`,
    });
  }
  if (w.retentionPercent !== null && w.retentionPercent < 70) {
    flags.push({
      icon: <AlertTriangle className="size-4" />,
      text: `Recall is ${w.retentionPercent}% — they may be adding faster than they can hold.`,
    });
  }

  return (
    <Card className="accountability-card">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-fg-tertiary" />
            Between lessons
          </span>
        }
        actions={
          <span className="text-[0.8125rem] text-fg-tertiary">
            last {w.windowDays} days
          </span>
        }
      />

      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <Figure
          label="Days studied"
          value={`${w.activeDays}/${w.windowDays}`}
        />
        <Figure label="Reviews" value={`${w.reviews}`} />
        <Figure
          label="Newly known"
          value={`${w.newlyKnown}`}
        />
      </div>

      {flags.length > 0 && (
        <ul className="divide-y divide-border">
          {flags.map((flag, i) => (
            <li
              key={i}
              className="flex gap-2.5 px-4 py-3 text-[0.875rem] text-fg-secondary"
            >
              <span className="mt-px shrink-0 text-warning">{flag.icon}</span>
              {flag.text}
            </li>
          ))}
        </ul>
      )}

      {w.struggling.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-1.5 text-[0.8125rem] font-medium text-fg-tertiary">
            Beating them most
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {w.struggling.map((word) => (
              <li
                key={word.term}
                className="rounded-full bg-surface-hover px-2.5 py-1 text-[0.8125rem]"
                title={word.meaning ?? undefined}
              >
                {word.term}
                <span className="text-fg-tertiary"> ×{word.misses}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {flags.length === 0 && w.activeDays > 0 && (
        <p className="px-4 py-3 text-[0.875rem] text-fg-secondary">
          {firstName} has kept at it. Worth saying so out loud — nobody
          else is going to.
        </p>
      )}

      {/* The card's one action. Everything above is something to say to
          somebody, and until this existed there was nowhere to say it —
          the tutor read the numbers, closed the tab, and remembered none
          of it a week later when the lesson came round.

          It DRAFTS, it does not send. The words are the learner's worst
          five and the sentence goes out signed by their tutor; a
          one-click send would be the app writing in someone else's voice
          about someone else's failure. */}
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-[0.8125rem] text-fg-tertiary">
          {flags.length > 0
            ? "Raise it now, not at the start of the lesson."
            : "Say it now — encouragement lands better unprompted."}
        </p>
        <form action={openStudentThread.bind(null, studentId, true)}>
          <Button type="submit" size="sm" variant="secondary">
            <MessageSquarePlus className="size-3.5" />
            Nudge
          </Button>
        </form>
      </div>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[0.75rem] text-fg-tertiary">{label}</p>
      <p className="mt-0.5 text-[1.25rem] leading-none font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}
