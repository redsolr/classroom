import "server-only";
import OpenAI, { toFile } from "openai";
import type { TranscriptionDiarized } from "openai/resources/audio/transcriptions";
import type { TranscribedSegment } from "@/lib/transcript";

/**
 * SPEECH TO TEXT — the only module that knows which company hears the
 * lesson.
 *
 * OpenAI, like the self-study tutor and the CRM's call notes; Anthropic
 * has no speech endpoint, and one transcription vendor is one budget
 * cap to watch. Not a provider abstraction, for the same reason
 * `realtimekit.ts` is not one: the DATA is what stays neutral —
 * `lesson_utterances` stores text and offsets, never a vendor's
 * response shape — so swapping means rewriting this file and nothing
 * that reads a row.
 *
 * WHY THIS MODEL. Every lesson is one file per person, so the speaker
 * is already a fact; what the pipeline needs from the transcriber is
 * TIMESTAMPS, to lay two separately transcribed voices on one clock.
 * On the current API the timestamped output (`diarized_json`, with
 * `start`/`end` per segment) is what `gpt-4o-transcribe-diarize`
 * returns; the plain `gpt-4o-transcribe` models return text only, and
 * `verbose_json` segment timestamps are the legacy `whisper-1` path.
 * `chunking_strategy: "auto"` is required by that model past thirty
 * seconds and is what lets a whole hour go in one request — a lesson
 * track is ~2.8 KB/s of Opus, so ninety minutes is still under the
 * 25 MB upload cap.
 */

export const TRANSCRIBE_MODEL =
  process.env.CLASSROOM_TRANSCRIBE_MODEL ?? "gpt-4o-transcribe-diarize";

export type TrackTranscription = {
  model: string;
  /** The input's duration as the provider measured it. */
  durationSeconds: number | null;
  segments: TranscribedSegment[];
};

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Transcribe one person's audio file.
 *
 * Loud when unconfigured rather than returning an empty transcript: a
 * lesson that "transcribed to nothing" because a key was missing would
 * be indistinguishable from a silent one, and the pipeline would mark
 * it done.
 */
export async function transcribeTrack(args: {
  body: Buffer;
  contentType: string;
  fileName: string;
}): Promise<TrackTranscription> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set — lesson transcription is not configured",
    );
  }
  const client = new OpenAI();
  const response = await client.audio.transcriptions.create({
    file: await toFile(args.body, args.fileName, { type: args.contentType }),
    model: TRANSCRIBE_MODEL,
    response_format: "diarized_json",
    chunking_strategy: "auto",
  });

  // The SDK's overload table (7.4) has no `diarized_json` entry, so the
  // call is typed as the plain shape. Narrowed by LOOKING, not by cast:
  // a model configured that cannot return timed segments (the plain
  // `gpt-4o-transcribe` family) would otherwise arrive as text with no
  // times and be stored as a lesson with nothing in it.
  const diarized = response as Partial<TranscriptionDiarized>;
  if (!Array.isArray(diarized.segments)) {
    throw new Error(
      `${TRANSCRIBE_MODEL} returned no timed segments — CLASSROOM_TRANSCRIBE_MODEL must name a model that supports diarized_json`,
    );
  }

  return {
    model: TRANSCRIBE_MODEL,
    durationSeconds:
      typeof diarized.duration === "number" ? diarized.duration : null,
    segments: diarized.segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
    })),
  };
}
