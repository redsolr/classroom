import "server-only";

/**
 * CLOUDFLARE REALTIMEKIT — the only module that knows which company runs
 * our calls.
 *
 * Deliberately NOT a provider abstraction. There is one provider and no
 * evidence yet of needing a second, and an interface written for an
 * imaginary second implementation is designed against a guess. What IS
 * kept provider-neutral is the data: `lesson_calls`, `lesson_recordings`
 * and `lesson_recording_tracks` store ids and roles, never RealtimeKit's
 * payload shapes. Swapping providers should mean rewriting this file and
 * nothing in the schema.
 *
 * AUTH: app-scoped Basic `appId:apiKey` against api.realtime.cloudflare.com,
 * not a Cloudflare account API token. The credential can only reach this
 * one RealtimeKit app, so a leak cannot touch R2, Workers or DNS — the
 * account-wide token would have been strictly worse.
 */

const API_BASE = "https://api.realtime.cloudflare.com/v2";

export type CallRole = "teacher" | "student";

export function realtimeKitConfigured(): boolean {
  return Boolean(
    process.env.REALTIMEKIT_APP_ID && process.env.REALTIMEKIT_API_KEY,
  );
}

function authHeader(): string {
  const appId = process.env.REALTIMEKIT_APP_ID;
  const apiKey = process.env.REALTIMEKIT_API_KEY;
  if (!appId || !apiKey) {
    // Loud, and named: a call that silently no-ops is worse than one that
    // refuses, because the lesson still happens and nobody learns it was
    // never going to be recorded.
    throw new Error(
      "RealtimeKit is not configured — set REALTIMEKIT_APP_ID and REALTIMEKIT_API_KEY",
    );
  }
  return `Basic ${Buffer.from(`${appId}:${apiKey}`).toString("base64")}`;
}

async function rtk<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    // Include the provider's own message. A bare status turns every
    // integration bug into a bisect.
    throw new Error(
      `RealtimeKit ${init?.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  return JSON.parse(text) as T;
}

/** Create the room for one booking. */
export async function createMeeting(title: string): Promise<string> {
  const body = await rtk<{ data: { id: string } }>("/meetings", {
    method: "POST",
    body: {
      title,
      // Never true. Recording starts only after both people have consented,
      // and `record_on_start` would start it at the moment of joining —
      // which is exactly the invisible recording we promise not to do.
      record_on_start: false,
      session_keep_alive_time_in_secs: 60,
    },
  });
  return body.data.id;
}

/**
 * Mint a short-lived participant token.
 *
 * `customParticipantId` carries OUR identity into the provider so the
 * track files come back attributable. The preset decides what the person
 * may do: the teacher hosts, the learner does not.
 */
export async function addParticipant(args: {
  meetingId: string;
  name: string;
  customParticipantId: string;
  role: CallRole;
}): Promise<{ token: string; participantId: string }> {
  const body = await rtk<{ data: { token: string; id: string } }>(
    `/meetings/${args.meetingId}/participants`,
    {
      method: "POST",
      body: {
        name: args.name,
        custom_participant_id: args.customParticipantId,
        preset_name:
          args.role === "teacher" ? "group_call_host" : "group_call_participant",
      },
    },
  );
  return { token: body.data.token, participantId: body.data.id };
}

/**
 * Who is actually connected right now.
 *
 * Deliberately the LIVE SESSION's participants, not the meeting's.
 * `/meetings/{id}/participants` lists everyone ever ADDED to the room —
 * it answers "who has a token", which is true of someone who never
 * opened the tab. Recording is gated on both people being present, and
 * that question only the session can answer.
 *
 * Returns empty when no session is live, which is the correct answer to
 * "who is in the call" when nobody is.
 */
export async function listActiveParticipants(
  meetingId: string,
): Promise<{ participantId: string; customParticipantId: string | null }[]> {
  const session = await rtk<{ data?: { id?: string; status?: string } }>(
    `/meetings/${meetingId}/active-session`,
  ).catch(() => null);
  const sessionId = session?.data?.id;
  if (!sessionId) return [];

  const body = await rtk<{
    data: {
      participants?: {
        id: string;
        user_id?: string;
        custom_participant_id?: string | null;
        left_at?: string | null;
      }[];
    };
  }>(`/sessions/${sessionId}/participants`);

  return (body.data.participants ?? [])
    .filter((p) => !p.left_at)
    .map((p) => ({
      // `user_id` is what the recording allowlist keys on — the same id
      // `addParticipant` returned. `id` here is the SESSION row's id and
      // is a different value; using it would silently record nothing.
      participantId: p.user_id ?? p.id,
      customParticipantId: p.custom_participant_id ?? null,
    }));
}

/**
 * Start recording each participant to their own audio file.
 *
 * `userIds` MUST be RealtimeKit's participant ids. The docs' example
 * (`["user-123", "user-456"]`) looks like an application-side id and is
 * not one: passing our `custom_participant_id` values produced a
 * recording that ran for two minutes, reported UPLOADED with no error,
 * and contained zero files. Callers pass ids resolved from the live
 * session, never our own.
 */
export async function startTrackRecording(args: {
  meetingId: string;
  userIds: string[];
  fileNamePrefix: string;
}): Promise<string> {
  if (args.userIds.length === 0) {
    throw new Error(
      "refusing to start a track recording with an empty participant list — it would silently record nothing",
    );
  }
  const body = await rtk<{ data: { recording: { id: string } } }>(
    "/recordings/track",
    {
      method: "POST",
      body: {
        meeting_id: args.meetingId,
        user_ids: args.userIds,
        layers: {
          default: { media_kind: "audio", file_name_prefix: args.fileNamePrefix },
        },
      },
    },
  );
  return body.data.recording.id;
}

export async function stopRecording(recordingId: string): Promise<void> {
  await rtk(`/recordings/${recordingId}`, {
    method: "PUT",
    body: { action: "stop" },
  });
}
