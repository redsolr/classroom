import { asc, eq, inArray } from "drizzle-orm";
import {
  db,
  lessonCalls,
  lessonRecordings,
  lessonRecordingTracks,
  lessonUtterances,
  type LessonRecording,
  type LessonRecordingTrack,
} from "@/db";
import {
  placeOnTimeline,
  trackStartFromFileName,
  type PlacedUtterance,
} from "@/lib/transcript";

/**
 * Everything recorded for one lesson, read for one purpose: laying what
 * was said on a single timeline.
 *
 * A lesson has one room, a room can have several recordings (stop and
 * start again), each recording has one track per person, and each track
 * has its utterances. All of it is returned together because the two
 * readers — the extractor and the lesson page — both need the whole
 * hour, not one file of it.
 *
 * Each track's start is resolved HERE, in order of how much we trust
 * it: the column written on ingest, then the file name (rows ingested
 * before the column existed), then the recording's own start.
 */
export type LessonTranscript = {
  recordings: LessonRecording[];
  tracks: LessonRecordingTrack[];
  placed: PlacedUtterance[];
};

export async function loadLessonTranscript(
  lessonId: string,
): Promise<LessonTranscript> {
  const call = await db.query.lessonCalls.findFirst({
    where: eq(lessonCalls.lessonId, lessonId),
    columns: { id: true },
  });
  if (!call) return { recordings: [], tracks: [], placed: [] };

  const recordings = await db
    .select()
    .from(lessonRecordings)
    .where(eq(lessonRecordings.callId, call.id))
    .orderBy(asc(lessonRecordings.startedAt), asc(lessonRecordings.createdAt));
  if (recordings.length === 0) return { recordings, tracks: [], placed: [] };

  const recordingIds = recordings.map((r) => r.id);
  const [tracks, utterances] = await Promise.all([
    db
      .select()
      .from(lessonRecordingTracks)
      .where(inArray(lessonRecordingTracks.recordingId, recordingIds)),
    db
      .select()
      .from(lessonUtterances)
      .where(inArray(lessonUtterances.recordingId, recordingIds))
      .orderBy(asc(lessonUtterances.sequence)),
  ]);

  const recordingStart = new Map(recordings.map((r) => [r.id, r.startedAt]));
  const trackStart = new Map(
    tracks.map((t) => [
      t.id,
      t.startedAt ??
        trackStartFromFileName(t.providerFileName) ??
        recordingStart.get(t.recordingId) ??
        null,
    ]),
  );

  const placed = placeOnTimeline(
    utterances.map((u) => ({
      id: u.id,
      role: u.role,
      sequence: u.sequence,
      startMs: u.startMs,
      endMs: u.endMs,
      text: u.text,
      trackStartedAt: trackStart.get(u.trackId) ?? null,
    })),
    null,
  );

  return { recordings, tracks, placed };
}
