import { TZDate } from "@date-fns/tz";
import type { TutorAvailability, TutorBooking } from "@/db";

/**
 * TURNING A WEEKLY PATTERN INTO BOOKABLE INSTANTS.
 *
 * A tutor says "Tuesdays, 9am to noon" — in their own life, which means
 * in their own timezone. A learner books an instant. Everything hard
 * about scheduling lives in the gap between those two sentences, and it
 * is a gap you can only cross with a real timezone database: "9am in
 * Bangkok" is a different UTC instant in July than a naive offset would
 * give you anywhere that observes DST, and the tutor did not move.
 *
 * So availability is stored as (weekday, minutes-from-midnight) in the
 * TUTOR's zone and resolved here with `TZDate` (date-fns v4's own
 * timezone support — the offset is looked up per instant, not assumed).
 * Minutes-from-midnight rather than a `time` column because slot maths
 * is arithmetic, and a `time` drags a date into every comparison.
 *
 * The learner never sees any of this: their browser renders the instant
 * in their own zone, which is the whole reason we go to the trouble of
 * producing a real instant rather than a wall-clock string.
 */

export type Slot = {
  /** The real instant this lesson starts. */
  startsAt: Date;
  endsAt: Date;
  /** Already taken — rendered, but not offerable. Showing a full day as
   * empty and showing it as full are very different messages, and only
   * one of them is true. */
  taken: boolean;
};

/** How far ahead a learner can book. Two weeks is enough to plan around
 * and short enough that a tutor's pattern changing doesn't strand
 * bookings months out. */
export const BOOKING_HORIZON_DAYS = 14;

/**
 * How long an unpaid booking holds its slot.
 *
 * Long enough to finish a Stripe checkout including a 3-D Secure
 * challenge on a bad connection; short enough that an abandoned tab does
 * not cost a tutor a Tuesday evening. Bookings past this are ignored by
 * the availability query rather than deleted — the row is evidence that
 * someone tried, which is worth keeping.
 */
export const BOOKING_HOLD_MINUTES = 20;

/** Notice a tutor gets before a lesson can start. Booking something 90
 * seconds from now is a way to waste both people's time. */
const MIN_NOTICE_MINUTES = 60;

function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Every slot a tutor is offering between now and the horizon.
 *
 * Walks real calendar days rather than adding 24h repeatedly: across a
 * DST boundary a "day" is 23 or 25 hours, and stepping by a fixed number
 * of milliseconds silently shifts every subsequent slot by an hour.
 */
export function buildSlots(input: {
  availability: TutorAvailability[];
  /** Confirmed and still-held bookings — both block a slot. */
  booked: Pick<TutorBooking, "startsAt" | "endsAt">[];
  lessonMinutes: number;
  /** IANA zone, e.g. "Asia/Bangkok". */
  timezone: string;
  now: Date;
}): Slot[] {
  const { availability, booked, lessonMinutes, timezone, now } = input;
  if (availability.length === 0) return [];

  const earliest = new Date(now.getTime() + MIN_NOTICE_MINUTES * 60_000);
  const slots: Slot[] = [];

  // Start from "today" AS THE TUTOR SEES IT — a learner in Auckland
  // asking on Tuesday morning is asking about the tutor's Monday, and
  // starting from the learner's date would drop that day's slots.
  const cursor = new TZDate(now, timezone);

  for (let dayOffset = 0; dayOffset <= BOOKING_HORIZON_DAYS; dayOffset += 1) {
    const day = new TZDate(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + dayOffset,
      timezone,
    );
    const weekday = day.getDay();

    for (const window of availability) {
      if (window.weekday !== weekday) continue;

      for (
        let minute = window.startMinute;
        minute + lessonMinutes <= window.endMinute;
        minute += lessonMinutes
      ) {
        const startsAt = new Date(
          new TZDate(
            day.getFullYear(),
            day.getMonth(),
            day.getDate(),
            Math.floor(minute / 60),
            minute % 60,
            timezone,
          ).getTime(),
        );
        if (startsAt < earliest) continue;

        const endsAt = new Date(startsAt.getTime() + lessonMinutes * 60_000);
        slots.push({
          startsAt,
          endsAt,
          taken: booked.some((b) =>
            overlaps(startsAt, endsAt, b.startsAt, b.endsAt),
          ),
        });
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Is this exact instant something the tutor is actually offering?
 *
 * The booking action re-derives the slot list and checks membership
 * rather than trusting the instant the client posted. A client-supplied
 * time is a request, not a fact: without this, anyone could book a
 * tutor's 3am, or a slot someone else took while the page was open.
 */
export function isOfferedSlot(slots: Slot[], startsAt: Date): Slot | undefined {
  return slots.find(
    (slot) => !slot.taken && slot.startsAt.getTime() === startsAt.getTime(),
  );
}

/**
 * The weekly pattern an instant represents, IN THE TUTOR'S ZONE.
 *
 * A recurring booking is stored as (weekday, minutes) because that is
 * what "same time every week" means to the person whose calendar it is —
 * and a stored UTC instant would drift by an hour against their actual
 * Tuesday evening twice a year. Reading the pattern off the server's
 * local clock instead of the tutor's zone is the obvious version of this
 * bug and would be invisible until someone booked from another continent.
 */
export function weeklyPatternFrom(
  instant: Date,
  timezone: string,
): { weekday: number; startMinute: number } {
  const zoned = new TZDate(instant, timezone);
  return {
    weekday: zoned.getDay(),
    startMinute: zoned.getHours() * 60 + zoned.getMinutes(),
  };
}

/**
 * The next `count` occurrences of a weekly pattern, as real instants.
 *
 * Used when a standing slot is paid for: the lessons are written onto
 * the tutor's agenda ahead of time so both sides can see them, rather
 * than materialising the morning of. Walks calendar days for the same
 * reason `buildSlots` does — a DST week is not 7 × 24 hours.
 */
export function nextOccurrences(input: {
  weekday: number;
  startMinute: number;
  timezone: string;
  count: number;
  from: Date;
}): Date[] {
  const { weekday, startMinute, timezone, count, from } = input;
  const out: Date[] = [];
  const cursor = new TZDate(from, timezone);

  for (let offset = 1; offset <= 7 * count + 7 && out.length < count; offset += 1) {
    const day = new TZDate(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + offset,
      timezone,
    );
    if (day.getDay() !== weekday) continue;
    out.push(
      new Date(
        new TZDate(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          Math.floor(startMinute / 60),
          startMinute % 60,
          timezone,
        ).getTime(),
      ),
    );
  }
  return out;
}

/** Group slots by calendar day in the VIEWER's zone — the day headings a
 * learner scans are their own days, not the tutor's. */
export function groupSlotsByDay(slots: Slot[]): Map<string, Slot[]> {
  const byDay = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = slot.startsAt.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(slot);
    else byDay.set(key, [slot]);
  }
  return byDay;
}
