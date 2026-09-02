import { AudioLines } from "lucide-react";
import type { LessonRecording } from "@/db";
import type { LessonTranscript } from "@/lib/lesson-transcript-queries";
import { formatClock } from "@/lib/transcript";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/page-header";

/**
 * WHAT HAPPENED TO THE RECORDING — the lesson page's window onto the
 * pipeline, and the transcript once there is one.
 *
 * It exists because the call page promises "the recording is being
 * processed; it will appear on the lesson once it is ready", and a
 * promise with no place to check on it is one a teacher stops
 * believing. Every state the pipeline can be in has a sentence here,
 * and a failure shows its reason rather than a spinner that never
 * stops. Rendered only when the lesson was recorded at all: a lesson
 * typed up from notes has nothing to say about audio.
 *
 * The transcript is read from its rows, laid on one clock, one line per
 * thing said — the SAME text the extractor was handed, so what the
 * teacher reviews below and what the draft was drawn from are one
 * document.
 */

type StateCopy = { tone: Tone; label: string; detail: string };

function describe(recording: LessonRecording): StateCopy {
  switch (recording.state) {
    case "awaiting_consent":
      return { tone: "neutral", label: "Not recorded", detail: "Recording never started — one of you had not agreed." };
    case "recording":
      return { tone: "warning", label: "Recording", detail: "The lesson is being recorded right now." };
    case "recording_complete":
    case "ingesting":
      return { tone: "warning", label: "Copying", detail: "The recording is being copied into your workspace." };
    case "ingested":
    case "transcription_queued":
    case "transcribing":
      return { tone: "warning", label: "Transcribing", detail: "Each person's audio is being turned into text." };
    case "transcribed":
    case "extracting":
      return { tone: "warning", label: "Drafting", detail: "Corrections, vocabulary and homework are being drafted from the transcript." };
    case "awaiting_teacher_review":
      return { tone: "info", label: "Draft ready", detail: "Review the draft on the right — nothing is saved to the record until you approve it." };
    case "completed":
      return recording.failureReason
        ? { tone: "neutral", label: "Nothing to draft", detail: recording.failureReason }
        : { tone: "success", label: "Reviewed", detail: "The transcript's draft has been reviewed." };
    case "failed":
      return { tone: "danger", label: "Failed", detail: recording.failureReason ?? "The recording could not be processed." };
    case "deleted":
      return { tone: "neutral", label: "Deleted", detail: "This recording was deleted." };
  }
}

export function RecordingPanel({
  transcript,
  studentName,
}: {
  transcript: LessonTranscript;
  studentName: string;
}) {
  const { recordings, placed } = transcript;
  if (recordings.length === 0) return null;
  // Several recordings of one lesson (stopped and started again) share
  // one transcript below; the status line follows the newest.
  const latest = recordings[recordings.length - 1];
  const copy = describe(latest);
  const totalSeconds = recordings.reduce((sum, r) => sum + (r.durationSeconds ?? 0), 0);
  const inFlightReason =
    latest.failureReason && !["failed", "completed"].includes(latest.state)
      ? latest.failureReason
      : null;

  return (
    <Card className="recording-panel">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <AudioLines className="size-4 text-fg-tertiary" />
            Recording
          </span>
        }
        actions={<Badge tone={copy.tone}>{copy.label}</Badge>}
      />
      <div className="space-y-3 px-4 py-3">
        <p className="text-[0.875rem] text-fg-secondary">
          {copy.detail}
          {totalSeconds > 0 ? ` · ${formatClock(totalSeconds * 1000)} of audio` : ""}
        </p>
        {inFlightReason && (
          <p className="text-[0.8125rem] text-fg-tertiary">
            Last attempt: {inFlightReason}. It will be retried automatically.
          </p>
        )}
        {placed.length > 0 && (
          <details className="transcript" open={latest.state === "awaiting_teacher_review"}>
            <summary className="cursor-pointer text-[0.875rem] font-medium">
              Transcript · {placed.length} lines
            </summary>
            <ol className="transcript-lines mt-2 max-h-96 space-y-1.5 overflow-y-auto pr-1">
              {placed.map((u) => (
                <li key={u.id} className="grid grid-cols-[3.5rem_auto_1fr] gap-x-2 text-[0.875rem]">
                  <span className="tabular-nums text-fg-tertiary">{formatClock(u.atMs)}</span>
                  <span className={u.role === "teacher" ? "font-medium text-fg" : "font-medium text-accent"}>
                    {u.role === "teacher" ? "You" : studentName}
                  </span>
                  <span className="min-w-0 whitespace-pre-wrap">{u.text}</span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </Card>
  );
}
