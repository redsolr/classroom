import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db, lessonCallWebhooks, lessonRecordings } from "@/db";
import { ingestRecording } from "@/lib/lesson-ingest";

/**
 * REALTIMEKIT WEBHOOKS — the provider telling us a recording finished.
 *
 * Two properties this handler exists to guarantee:
 *
 * 1. AUTHENTICITY. Every delivery is signed; an unsigned or badly signed
 *    one is rejected outright. Nothing here is derived from a caller we
 *    have not verified — this endpoint is public and changes lesson state.
 *
 * 2. IDEMPOTENCY. RealtimeKit retries, and a retried `UPLOADED` must not
 *    kick off a second ingest or a second transcript. The delivery id
 *    goes into a table with a unique index FIRST; if the insert finds a
 *    row already there, the event has been handled and we stop.
 */

const WELL_KNOWN = "https://api.realtime.cloudflare.com/.well-known/webhooks.json";

// Cached across invocations in a warm lambda. The key is stable; refetching
// it per delivery would add a network hop to every webhook.
let keyPromise: Promise<CryptoKey> | null = null;

/**
 * The well-known document is NOT a JWKS, despite the shape of the URL. It
 * is `{ data: { publicKey: "-----BEGIN PUBLIC KEY-----…" } }` — a single
 * RSA key in PEM SPKI form. Importing it as a JWK does not throw, it just
 * yields nothing to verify with, and every signature then reads as
 * invalid — which is indistinguishable from a forgery. Import as spki.
 */
async function providerKey(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const res = await fetch(WELL_KNOWN, { cache: "no-store" });
    if (!res.ok) throw new Error(`could not fetch ${WELL_KNOWN}: ${res.status}`);
    const doc = (await res.json()) as {
      data?: { publicKey?: string };
      publicKey?: string;
    };
    const pem = doc.data?.publicKey ?? doc.publicKey;
    if (!pem) throw new Error(`no publicKey at ${WELL_KNOWN}`);
    const der = Buffer.from(
      pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""),
      "base64",
    );
    return crypto.subtle.importKey(
      "spki",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  })();
  return keyPromise;
}

export async function POST(request: Request): Promise<NextResponse> {
  // RAW bytes. Parsing and re-serialising before verifying would change
  // whitespace and key order, and the signature covers the bytes that
  // were sent, not the object they decode to.
  const raw = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("rtk-signature");
  const deliveryId = request.headers.get("rtk-uuid");

  if (!signature || !deliveryId) {
    return NextResponse.json({ error: "unsigned" }, { status: 401 });
  }

  let verified = false;
  try {
    verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      await providerKey(),
      Buffer.from(signature, "base64"),
      raw,
    );
  } catch (error) {
    console.error("realtimekit webhook: signature check failed", error);
    // A key we could not fetch is OUR outage, not a bad caller. 500 makes
    // the provider retry; 401 would make it give up on a real event.
    return NextResponse.json({ error: "verification unavailable" }, { status: 500 });
  }
  if (!verified) {
    console.error(`realtimekit webhook: bad signature, delivery ${deliveryId}`);
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw.toString("utf8")) as WebhookPayload;
  } catch (error) {
    console.error("realtimekit webhook: unparseable body", error);
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const providerRecordingId =
    payload.recording?.id ?? payload.recording?.recordingId ?? null;

  // Claim the delivery. Losing this race means a retry got here first.
  const claimed = await db
    .insert(lessonCallWebhooks)
    .values({
      deliveryId,
      event: payload.event ?? "unknown",
      providerRecordingId,
    })
    .onConflictDoNothing({ target: lessonCallWebhooks.deliveryId })
    .returning();
  if (claimed.length === 0) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    await handle(payload, providerRecordingId);
  } catch (error) {
    console.error(
      `realtimekit webhook: handling ${payload.event} for recording ${providerRecordingId} failed`,
      error,
    );
    // 500 so the provider retries. The delivery row stays, but the retry
    // carries a NEW rtk-uuid, so it is not swallowed as a duplicate.
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function handle(
  payload: WebhookPayload,
  providerRecordingId: string | null,
): Promise<void> {
  if (payload.event !== "recording.statusUpdate" || !providerRecordingId) return;

  const recording = await db.query.lessonRecordings.findFirst({
    where: eq(lessonRecordings.providerRecordingId, providerRecordingId),
  });
  // A recording we never started — another app on the same RealtimeKit
  // app, or a stale spike. Recorded in the deliveries table, acted on
  // nowhere.
  if (!recording) return;

  const status = payload.recording?.status;
  const now = new Date();

  if (status === "UPLOADED") {
    await db
      .update(lessonRecordings)
      .set({
        state: "recording_complete",
        stoppedAt: recording.stoppedAt ?? now,
        durationSeconds:
          typeof payload.recording?.recordingDuration === "number"
            ? Math.round(payload.recording.recordingDuration)
            : recording.durationSeconds,
        // The provider's copy dies on this date. Stored now so the
        // reconciler can act BEFORE it does, rather than discover it after.
        providerExpiresAt: payload.recording?.downloadUrlExpiry
          ? new Date(payload.recording.downloadUrlExpiry)
          : recording.providerExpiresAt,
        updatedAt: now,
      })
      .where(eq(lessonRecordings.id, recording.id));

    // COPY IT NOW. The seven-day clock on the provider's own copy starts
    // here, and the cheapest moment to own the bytes is the one where we
    // have just been told they exist.
    //
    // `after` rather than awaiting it inline: copying two audio files
    // takes far longer than a webhook should wait, and a delivery that
    // times out is retried with a NEW delivery id — which our idempotency
    // table cannot recognise as the same event, so it would start a
    // second ingest of the same recording. Retrying is the reconciler's
    // job, on its own clock, and a failure here is loud rather than
    // silent because nothing else in this handler will notice it.
    after(async () => {
      try {
        const outcome = await ingestRecording(recording.id);
        console.log(
          `[ingest] ${recording.id}: ${outcome.state} (copied ${outcome.copied}, already stored ${outcome.alreadyStored})`,
        );
      } catch (error) {
        console.error(`[ingest] ${recording.id}: ingestion threw`, error);
      }
    });
    return;
  }

  if (status === "ERRORED") {
    await db
      .update(lessonRecordings)
      .set({
        state: "failed",
        failureReason:
          payload.recording?.errMessage ?? "provider reported ERRORED",
        updatedAt: now,
      })
      .where(eq(lessonRecordings.id, recording.id));
  }
}

type WebhookPayload = {
  event?: string;
  recording?: {
    id?: string;
    recordingId?: string;
    status?: string;
    recordingDuration?: number;
    downloadUrlExpiry?: string | null;
    errMessage?: string | null;
  };
};
