import type { CallRole } from "@/lib/call-participants";

/**
 * FROM TWO VOICES TO ONE TRANSCRIPT — pure, no database, no provider.
 *
 * A lesson is recorded as one audio file per person, and each file is
 * transcribed on its own. That is the whole reason to own the call:
 * WHO said something is a fact about which file it came from, never a
 * model's guess. The price is that nothing arrives in order — the
 * teacher's file has the teacher's sentences, the learner's file has
 * the learner's, and the conversation only exists once the two are laid
 * on one clock.
 *
 * Everything that is a DECISION rather than an I/O call lives here so
 * `e2e/lesson-transcript.spec.ts` can pin it down without a browser:
 * where a track sits on the timeline, what counts as an utterance, how
 * the merged transcript reads, and how an utterance is named so a later
 * claim can point back at it.
 */

/** One thing one person said, as the transcriber returned it. */
export type TranscribedSegment = {
  /** Seconds from the start of THIS person's file. */
  start: number;
  end: number;
  text: string;
};

/** What one track contributes, before it is stored. */
export type UtteranceDraft = {
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
};

/** An utterance as the timeline needs to see it. */
export type TimelineUtterance = {
  id: string;
  role: CallRole;
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
  /** When this utterance's TRACK began. Null when the file name did not say. */
  trackStartedAt: Date | null;
};

/** An utterance placed on the lesson's single clock. */
export type PlacedUtterance = TimelineUtterance & {
  /** Milliseconds from the start of the lesson's earliest track. */
  atMs: number;
  /** The short, stable handle a claim can cite: `T12`, `S7`. */
  label: string;
};

/**
 * `lesson_<user_id>_<peer_id>_peer_audio_<ms>.webm` → the `<ms>`.
 *
 * The provider stamps each track file with the epoch millisecond it
 * began, as the last segment of the name. The two live-call tracks of
 * 2026-08-30 carry `…1788069291640` and `…1788069291935`: 295 ms apart,
 * both ~47 s after the row's `started_at` (the provider takes a moment
 * to begin writing). That difference is exactly the offset a reconnect
 * turns into minutes, and the reason it is read rather than assumed.
 *
 * The stamp is not always a whole number: the 2026-09-02 live call
 * produced `…_peer_audio_1788344160183.2737.webm` — milliseconds with a
 * fraction, which also means the extension is not the last dot. Both
 * shapes are real, so both are read.
 *
 * Strict about shape otherwise, like `participantIdFromFileName`: a name
 * that does not match returns null, and the caller falls back to the
 * recording's own start, which is honest to within a second.
 */
export function trackStartFromFileName(fileName: string): Date | null {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, "");
  const parts = stem.split("_");
  if (parts.length < 6) return null;
  const last = parts[parts.length - 1];
  if (!/^\d{12,14}(\.\d+)?$/.test(last)) return null;
  const date = new Date(Math.floor(Number(last)));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Turn the provider's segments into the rows we keep.
 *
 * Empty segments are dropped, not stored: a row with nothing said is a
 * row a later claim could cite for nothing. Segments are kept in the
 * order they came (they arrive ordered by time) and renumbered densely,
 * so `sequence` is a contiguous index into the track.
 */
export function utterancesFromSegments(
  segments: TranscribedSegment[],
): UtteranceDraft[] {
  const drafts: UtteranceDraft[] = [];
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    const startMs = Math.max(0, Math.round(segment.start * 1000));
    const endMs = Math.max(startMs, Math.round(segment.end * 1000));
    drafts.push({ sequence: drafts.length, startMs, endMs, text });
  }
  return drafts;
}

/**
 * Lay every utterance of a lesson on one clock.
 *
 * Each track's utterances are offset by when THAT file began, relative
 * to the earliest file — so a learner who dropped and rejoined ten
 * minutes in has their second file's sentences land ten minutes in,
 * not at the top. A track whose start is unknown is placed at the
 * recording's own start (`fallbackStart`), which is off by the
 * provider's write delay and nothing worse.
 *
 * Ties are broken by role (teacher first) then sequence, so the order is
 * deterministic for equal timestamps rather than depending on the order
 * rows came back from the database.
 */
export function placeOnTimeline(
  utterances: TimelineUtterance[],
  fallbackStart: Date | null,
): PlacedUtterance[] {
  const startOf = (u: TimelineUtterance): number =>
    (u.trackStartedAt ?? fallbackStart)?.getTime() ?? 0;
  const origin = utterances.reduce(
    (min, u) => Math.min(min, startOf(u)),
    Number.POSITIVE_INFINITY,
  );
  const base = Number.isFinite(origin) ? origin : 0;

  return utterances
    .map((u) => ({
      ...u,
      atMs: startOf(u) - base + u.startMs,
      label: utteranceLabel(u.role, u.sequence),
    }))
    .sort(
      (a, b) =>
        a.atMs - b.atMs ||
        roleOrder(a.role) - roleOrder(b.role) ||
        a.sequence - b.sequence,
    );
}

/**
 * The handle a claim cites: the speaker's initial and the utterance's
 * place in their track. Short enough to appear on every line of a
 * transcript handed to a model; stable for as long as the track's
 * transcription stands (a re-transcription replaces the rows, and the
 * labels with them — by design, because the old text is gone too).
 */
export function utteranceLabel(role: CallRole, sequence: number): string {
  return `${role === "teacher" ? "T" : "S"}${sequence + 1}`;
}

/** `00:00`, `12:07`, `1:02:15` — the clock a person reads. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * The transcript as the extraction prompt reads it.
 *
 * One line per utterance: its label, who spoke, when, and what. The
 * speaker labels are what let the existing extraction rules apply —
 * "only the student's own errors become corrections" is only checkable
 * when every line says whose it is — and the `[T12]` handle is there so
 * a later pass can ask the model to cite the line a claim rests on
 * instead of inventing a timestamp.
 */
export function renderTranscript(
  placed: PlacedUtterance[],
  names: { teacher: string; student: string },
): string {
  return placed
    .map(
      (u) =>
        `[${u.label}] ${u.role === "teacher" ? names.teacher : names.student} (${formatClock(u.atMs)}): ${u.text}`,
    )
    .join("\n");
}

/**
 * What the extractor is handed when a lesson has BOTH a transcript and
 * the teacher's own typed notes. The notes come first: they are the
 * teacher's reading of the hour and carry things no microphone heard.
 * Neither is ever written into the other's column — the transcript is
 * re-rendered from its rows every time, so re-running extraction cannot
 * stack a second copy of it under the first.
 */
export function composeExtractionInput(
  notes: string | null,
  transcript: string,
): string {
  const trimmedNotes = notes?.trim() ?? "";
  if (!transcript) return trimmedNotes;
  if (!trimmedNotes) return `<transcript>\n${transcript}\n</transcript>`;
  return `<teacher_notes>\n${trimmedNotes}\n</teacher_notes>\n\n<transcript>\n${transcript}\n</transcript>`;
}

function roleOrder(role: CallRole): number {
  return role === "teacher" ? 0 : 1;
}
