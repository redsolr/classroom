import { roleFromParticipantId, type CallRole } from "@/lib/call-participants";

/**
 * WHAT THE PROVIDER SAYS IT PRODUCED — parsed in exactly one place.
 *
 * The ingest pipeline turns a provider payload into "these files, for
 * these people, expiring then". Everything downstream (what to copy,
 * whether a lesson is fully ours, when it stops being fetchable) reads
 * this shape and never the provider's own.
 *
 * Pure on purpose: no database, no fetch, no `server-only`. The riskiest
 * decision in the whole feature — WHOSE VOICE a file is — is made here,
 * and this is what lets `e2e/lesson-ingest.spec.ts` exercise it against
 * real payload shapes without a browser or a provider.
 *
 * THE SHAPE IS NOT WHAT THE DOCS SAY. The published example is
 * `download_url: [{ layer_name, download_urls: { "<file>": { download_url } } }]`.
 * What the API actually returned in the live call is
 * `download_url: { links: [{ download_urls: { "<file>": { download_url,
 * custom_participant_id } } }] }`, and the per-file `custom_participant_id`
 * — the thing that makes a file attributable — is not in the docs at all.
 * Both are accepted, because a provider that changed once can change back,
 * and the failure mode of guessing wrong is a lesson whose audio we hold
 * and cannot attribute.
 */

export type RecordingFile = {
  /** The provider's own file name. Unique per recording; our join key. */
  fileName: string;
  /** Presigned, short-lived, and the only way to the bytes. */
  downloadUrl: string;
  /** OUR id for the person (`teacher:<uuid>`), when the provider echoes it. */
  customParticipantId: string | null;
  /**
   * RealtimeKit's participant id, read out of the file name.
   *
   * The naming convention is
   * `{prefix}_{user_id}_{peer_id}_{stream_kind}_{media_kind}_{ts}.webm`,
   * so the id we passed in `user_ids` — and stored on the track row — is
   * recoverable from the name alone. That is a second, independent way to
   * attribute a file, which matters because it is derived from a FACT we
   * recorded rather than from a field the provider may stop sending.
   */
  providerParticipantId: string | null;
};

export type RecordingManifest = {
  /** `UPLOADED`, `ERRORED`, `RECORDING`… uppercased, or null if absent. */
  status: string | null;
  durationSeconds: number | null;
  /** When the provider's own copy stops being fetchable. */
  expiresAt: Date | null;
  files: RecordingFile[];
};

/** One track row as the matcher needs to see it. */
export type TrackForMatching = {
  id: string;
  role: CallRole;
  providerParticipantId: string;
  providerFileName: string;
  storageKey: string | null;
};

export type FileAttribution =
  | {
      kind: "copy";
      file: RecordingFile;
      role: CallRole;
      /** The track row this file belongs to, or null when it needs a new one. */
      trackId: string | null;
    }
  | { kind: "done"; file: RecordingFile; trackId: string }
  | { kind: "unattributable"; file: RecordingFile; reason: string };

export function parseRecordingManifest(payload: unknown): RecordingManifest {
  // `{ data: { recording: {…} } }` and `{ data: {…} }` are both real: the
  // fetch endpoint has returned each of them.
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  const raw = asRecord(data?.recording) ?? data;
  if (!raw) return { status: null, durationSeconds: null, expiresAt: null, files: [] };

  const duration = raw.recordingDuration ?? raw.recording_duration ?? raw.duration;
  const expiry =
    raw.downloadUrlExpiry ?? raw.download_url_expiry ?? raw.downloadUrlExpiryTime;

  return {
    status: typeof raw.status === "string" ? raw.status.toUpperCase() : null,
    durationSeconds: typeof duration === "number" ? Math.round(duration) : null,
    expiresAt: parseDate(expiry),
    files: parseFiles(raw.download_url ?? raw.downloadUrl),
  };
}

/**
 * Decide, for every file the provider produced, what to do with it.
 *
 * Attribution runs in two passes because the two signals are not equally
 * strong. `custom_participant_id` is OUR id and says the role outright.
 * The file name carries the provider's participant id, which we stored on
 * the track row when the recording started — so it identifies the exact
 * ROW, not just the side. Both are recorded facts; neither is a guess
 * about who was talking, which is the whole reason the call is recorded
 * per person in the first place.
 *
 * A file we cannot attribute is NEVER copied to a default. Storing a
 * lesson's audio under the wrong person is worse than not storing it: the
 * first is a privacy incident, the second is a retry.
 */
export function attributeFiles(
  files: RecordingFile[],
  tracks: TrackForMatching[],
): FileAttribution[] {
  const byFileName = new Map(tracks.map((t) => [t.providerFileName, t]));
  const byProviderId = new Map(tracks.map((t) => [t.providerParticipantId, t]));
  // The rows written when recording started, one per person, still holding
  // their placeholder name. Claimed left-to-right by role as files arrive.
  const unclaimed = tracks.filter((t) => t.providerFileName.startsWith("pending:"));
  const claimed = new Set<string>();

  return files.map((file): FileAttribution => {
    // Already ours: a second pass over a recording we have copied.
    const known = byFileName.get(file.fileName);
    if (known?.storageKey) return { kind: "done", file, trackId: known.id };
    if (known) {
      return { kind: "copy", file, role: known.role, trackId: known.id };
    }

    const role =
      roleFromParticipantId(file.customParticipantId) ??
      (file.providerParticipantId
        ? (byProviderId.get(file.providerParticipantId)?.role ?? null)
        : null);
    if (!role) {
      return {
        kind: "unattributable",
        file,
        reason: file.customParticipantId
          ? `participant ${file.customParticipantId} is not one of ours`
          : "no participant id on the file or in its name",
      };
    }

    // Prefer the row this exact provider participant wrote, then any
    // still-unclaimed row for the right side.
    const exact = file.providerParticipantId
      ? byProviderId.get(file.providerParticipantId)
      : undefined;
    const target =
      exact && !claimed.has(exact.id) && exact.providerFileName.startsWith("pending:")
        ? exact
        : unclaimed.find((t) => t.role === role && !claimed.has(t.id));
    if (target) claimed.add(target.id);

    // No free row means this person produced a SECOND file — a reconnect
    // mid-lesson does exactly that. It gets its own row rather than
    // overwriting the first, because both halves of their voice are the
    // lesson.
    return { kind: "copy", file, role, trackId: target?.id ?? null };
  });
}

/**
 * Why this recording is not ours yet, or null when it is.
 *
 * The bar is BOTH VOICES, not a file count: `expectedTrackCount` counts
 * PEOPLE, a reconnect adds files without adding people, and a status of
 * UPLOADED has already been observed on a recording containing nothing.
 * This is the only thing allowed to say a lesson has been ingested, so it
 * answers with the reason rather than a boolean — an artifact we do not
 * hold should be able to say what is missing.
 */
export function describeMissing(
  tracks: TrackForMatching[],
  recording: { expectedTrackCount: number },
  unattributable: string[],
  errors: string[],
): string | null {
  const stored = tracks.filter((t) => t.storageKey !== null);
  const roles = new Set(stored.map((t) => t.role));
  const problems: string[] = [];

  if (stored.length === 0) {
    problems.push("no track file has been copied");
  } else if (roles.size < Math.min(recording.expectedTrackCount, 2)) {
    problems.push(
      `only ${[...roles].join(", ")} audio is stored — ${recording.expectedTrackCount} people were recorded`,
    );
  }
  const pending = tracks.filter((t) => t.storageKey === null);
  if (pending.length > 0) {
    problems.push(`${pending.length} expected track(s) not copied`);
  }
  if (unattributable.length > 0) {
    problems.push(`unattributable: ${unattributable.join("; ")}`);
  }
  if (errors.length > 0) problems.push(`errors: ${errors.join("; ")}`);

  return problems.length > 0 ? problems.join(" · ") : null;
}

// ---------------------------------------------------------------------------

function parseFiles(value: unknown): RecordingFile[] {
  // A composite recording's `download_url` is a plain string. We only ever
  // start TRACK recordings, so a string here means something produced a
  // recording we did not ask for — ignored rather than half-understood.
  const layers = Array.isArray(value)
    ? value
    : Array.isArray(asRecord(value)?.links)
      ? (asRecord(value)!.links as unknown[])
      : [];

  const files: RecordingFile[] = [];
  for (const layer of layers) {
    const urls = asRecord(asRecord(layer)?.download_urls);
    if (!urls) continue;
    for (const [fileName, entry] of Object.entries(urls)) {
      const record = asRecord(entry);
      const downloadUrl =
        typeof record?.download_url === "string"
          ? record.download_url
          : typeof entry === "string"
            ? entry
            : null;
      if (!downloadUrl) continue;
      const custom = record?.custom_participant_id;
      files.push({
        fileName,
        downloadUrl,
        customParticipantId: typeof custom === "string" ? custom : null,
        providerParticipantId: participantIdFromFileName(fileName),
      });
    }
  }
  return files;
}

/**
 * `lesson_<user_id>_<peer_id>_peer_audio_<ms>.webm` → `<user_id>`.
 *
 * Positional, and deliberately strict about the segment count: a name
 * that does not match the documented convention returns null rather than
 * a plausible-looking fragment, because a wrong id here attributes a
 * voice to the wrong person.
 */
export function participantIdFromFileName(fileName: string): string | null {
  const parts = fileName.replace(/\.[a-z0-9]+$/i, "").split("_");
  if (parts.length < 6) return null;
  return parts[1] || null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
