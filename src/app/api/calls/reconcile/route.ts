import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { reconcileRecordings } from "@/lib/lesson-ingest";

/**
 * `GET|POST /api/calls/reconcile` — the lesson-audio safety net.
 *
 * Vercel's cron (vercel.json) calls GET with
 * `Authorization: Bearer $CRON_SECRET`, which Vercel sends automatically
 * once the env var exists; the founder can run it by hand with the same
 * header when a lesson needs rescuing now.
 *
 * It exists because a webhook is a delivery, not a guarantee. Every
 * recording that finished and is not in our bucket yet gets picked up
 * here — including ones whose webhook was never sent — and anything whose
 * provider copy is about to expire is named loudly in the response and
 * the logs.
 *
 * Closed by default, same posture as `/mcp` and the CRM's digest: no
 * `CRON_SECRET` ⇒ 503 for everyone; wrong or missing bearer ⇒ 401. This
 * endpoint reads no user data, but it spends provider requests and
 * storage writes, and an open trigger is an open bill.
 */

/** Never served from a cache: the whole point is what is true right now. */
export const dynamic = "force-dynamic";

/** Copying several lessons' audio is not a five-second job. */
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  // Length first: timingSafeEqual throws on a mismatch rather than
  // returning false, and the length is not the secret.
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      {
        error: "reconcile_disabled",
        message: "CRON_SECRET is not configured — the reconciler is closed",
      },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "unauthorized", message: "Invalid or missing bearer token" },
      { status: 401 },
    );
  }

  try {
    const report = await reconcileRecordings();
    return NextResponse.json({
      considered: report.considered,
      ingested: report.ingested,
      still_waiting: report.stillWaiting,
      failed: report.failed,
      expiring_soon: report.expiringSoon,
    });
  } catch (error) {
    console.error("[ingest] reconcile run failed:", error);
    return NextResponse.json(
      {
        error: "reconcile_failed",
        message: error instanceof Error ? error.message : "Reconcile run failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
