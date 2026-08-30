"use client";

import * as React from "react";
import { CalendarClock, Info } from "lucide-react";
import { bookTutorLesson } from "@/lib/actions/tutors";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Slot } from "@/lib/tutor-slots";

/**
 * THE BOOKING MODAL — what the lesson is FOR, asked once.
 *
 * A booking form that only takes a time produces a lesson where the
 * first ten minutes are spent working out why anyone is there. So this
 * asks the two questions a tutor actually needs — what to focus on, and
 * anything specific — and hands the answers straight to the prep sheet
 * they already read before every lesson.
 *
 * It arrives PREFILLED from the learner's last booking with this tutor.
 * The second lesson with someone you already study with should be one
 * tap: re-typing "conversation, working on past tense" every fortnight
 * is exactly the small friction that quietly ends a habit, and we
 * already know the answer because they told us last time. Prefilled, not
 * locked — what you want to work on is the thing most likely to change.
 */

export type BookingTutor = {
  profileId: string;
  name: string;
  lessonMinutes: number;
  /** Price of one lesson, formatted — the split is explained by the
   * caller's breakdown panel, not re-derived here. */
  singlePrice: string;
  monthlyPrice: string;
  discountPercent: number;
};

export function BookingDialog({
  tutor,
  slot,
  focusOptions,
  defaultFocus,
  defaultNotes,
  children,
}: {
  tutor: BookingTutor;
  slot: Slot;
  focusOptions: readonly string[];
  defaultFocus: string[];
  defaultNotes: string | null;
  children: React.ReactNode;
}) {
  const [plan, setPlan] = React.useState<"single" | "recurring">("single");
  const [focus, setFocus] = React.useState<string[]>(defaultFocus);

  const toggleFocus = (option: string) =>
    setFocus((prev) =>
      prev.includes(option)
        ? prev.filter((f) => f !== option)
        : [...prev, option],
    );

  const when = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(slot.startsAt);

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title={`Book ${tutor.name}`}
        description={`${when} · ${tutor.lessonMinutes} minutes`}
      >
        <form action={bookTutorLesson} className="space-y-5">
          <input type="hidden" name="profileId" value={tutor.profileId} />
          {/* The INSTANT, not a wall-clock string — the server re-derives
              the tutor's real slots and checks this against them, so a
              time that stopped being available while this dialog sat
              open is refused rather than sold. */}
          <input
            type="hidden"
            name="startsAt"
            value={slot.startsAt.toISOString()}
          />
          <input type="hidden" name="plan" value={plan} />

          {/* ── One lesson, or every week ─────────────────────────── */}
          <fieldset>
            <legend className="mb-2 text-[0.875rem] font-medium">
              How often?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <PlanOption
                selected={plan === "single"}
                onSelect={() => setPlan("single")}
                title="Just this lesson"
                price={tutor.singlePrice}
                detail="One booking, paid now."
              />
              <PlanOption
                selected={plan === "recurring"}
                onSelect={() => setPlan("recurring")}
                title="Every week"
                price={`${tutor.monthlyPrice}/mo`}
                detail={`Same slot each week · ${tutor.discountPercent}% off`}
              />
            </div>
            {plan === "recurring" && (
              <p className="mt-2 flex gap-1.5 text-[0.8125rem] text-fg-secondary">
                <CalendarClock className="mt-px size-3.5 shrink-0 text-fg-tertiary" />
                This slot becomes yours every week. The next four lessons
                go on both calendars as soon as it&rsquo;s paid, and you
                can cancel any month from your lessons page.
              </p>
            )}
          </fieldset>

          {/* ── What the lesson is for ────────────────────────────── */}
          <fieldset>
            <legend className="mb-2 text-[0.875rem] font-medium">
              What do you want to work on?
            </legend>
            <div className="flex flex-wrap gap-2">
              {focusOptions.map((option) => {
                const on = focus.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleFocus(option)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[0.875rem] transition-colors",
                      on
                        ? "border-transparent bg-accent text-white"
                        : "border-border-strong text-fg-secondary hover:bg-surface-hover",
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {/* Checkboxes rather than a serialised string: FormData's
                getAll gives the action a real array, and the closed set
                is what lets the prep sheet read it. */}
            {focus.map((f) => (
              <input key={f} type="hidden" name="focus" value={f} />
            ))}
            {defaultFocus.length > 0 && (
              <p className="mt-2 text-[0.8125rem] text-fg-tertiary">
                Filled in from your last lesson — change anything.
              </p>
            )}
          </fieldset>

          <Field label="Anything specific?">
            <Textarea
              id="booking-notes"
              name="notes"
              rows={3}
              defaultValue={defaultNotes ?? ""}
              placeholder="I keep freezing on past tense. I'd like to practise ordering food."
            />
          </Field>

          <p className="flex gap-1.5 rounded-lg bg-surface-hover px-3 py-2 text-[0.8125rem] text-fg-secondary">
            <Info className="mt-px size-3.5 shrink-0 text-fg-tertiary" />
            You&rsquo;ll pay on Stripe. The slot is held for 20 minutes
            while you do — nothing goes on {tutor.name}&rsquo;s calendar
            until the payment clears.
          </p>

          <SubmitButton className="w-full">
            {plan === "single"
              ? `Pay ${tutor.singlePrice} and book`
              : `Start weekly lessons · ${tutor.monthlyPrice}/mo`}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlanOption({
  selected,
  onSelect,
  title,
  price,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  price: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-accent bg-accent-soft"
          : "border-border-strong hover:bg-surface-hover",
      )}
    >
      <span className="block text-[0.875rem] font-semibold">{title}</span>
      <span className="mt-0.5 block text-[1.125rem] font-semibold tracking-tight">
        {price}
      </span>
      <span className="mt-0.5 block text-[0.8125rem] text-fg-secondary">
        {detail}
      </span>
    </button>
  );
}
