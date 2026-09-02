import "server-only";
import { createIngest } from "@/lib/lesson-ingest-core";
import { putLessonAudio, r2Configured } from "@/lib/r2";
import {
  downloadTrackFile,
  fetchRecording,
  realtimeKitConfigured,
} from "@/lib/realtimekit";

/**
 * The production wiring for lesson-audio ingestion: the real provider and
 * the real bucket, handed to the orchestration in `lesson-ingest-core.ts`.
 *
 * This file is the `server-only` boundary. The core deliberately is not,
 * so that `e2e/lesson-ingest.db.spec.ts` can run the same orchestration
 * against the real database with a provider and a store it controls.
 */
export const { ingestRecording, reconcileRecordings } = createIngest({
  provider: { fetchRecording, downloadTrackFile },
  storage: { putLessonAudio },
  configured: () => ({
    provider: realtimeKitConfigured(),
    storage: r2Configured(),
  }),
});

export type { IngestOutcome, ReconcileReport } from "@/lib/lesson-ingest-core";
