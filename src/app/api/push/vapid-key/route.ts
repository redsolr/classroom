import { getLearner } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/push";

/**
 * The public half of the VAPID pair, or null.
 *
 * Null is a first-class answer, not an error: with no keys configured
 * the client renders no enable button and the app falls back to the
 * in-app unread badge. Same 204-means-dormant contract the CRM's
 * realtime hook uses, so this ships and merges before anyone generates
 * a key pair.
 *
 * `getLearner()` (not the redirecting guard) is the auth line —
 * anonymous callers get a 401, never a redirect into HTML.
 */
export async function GET() {
  const learner = await getLearner();
  if (!learner) return new Response("Unauthorized", { status: 401 });

  return Response.json({ key: vapidPublicKey() });
}
