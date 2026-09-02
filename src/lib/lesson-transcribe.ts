import "server-only";
import { draftLessonFromEvidence } from "@/lib/lesson-draft";
import { createTranscriptPipeline } from "@/lib/lesson-transcribe-core";
import { getLessonAudio, r2Configured } from "@/lib/r2";
import { transcribeTrack, transcriptionConfigured } from "@/lib/transcription";

/**
 * The production wiring for what happens after a lesson's audio is
 * ours: the real bucket, the real transcriber, the real draft loop,
 * handed to the orchestration in `lesson-transcribe-core.ts`.
 *
 * The `server-only` boundary, like `lesson-ingest.ts`; the core is not,
 * so `e2e/lesson-transcribe.db.spec.ts` can run the same orchestration
 * against the real database with stand-ins it controls.
 */
export const { processRecording, reconcileTranscripts } =
  createTranscriptPipeline({
    storage: { getLessonAudio },
    transcriber: { transcribeTrack },
    drafter: { draftLesson: draftLessonFromEvidence },
    configured: () => ({
      storage: r2Configured(),
      transcriber: transcriptionConfigured(),
    }),
  });

export type {
  TranscriptOutcome,
  TranscriptReport,
} from "@/lib/lesson-transcribe-core";
