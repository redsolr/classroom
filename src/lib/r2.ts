import "server-only";
import { createHash } from "node:crypto";
import { sha256Hex, signRequest } from "@/lib/s3-signature";

/**
 * OUR OWN BUCKET — the only module that knows where the bytes live.
 *
 * Cloudflare R2, reached over the S3 API (there is no Workers binding to
 * use from a Next app on Vercel). Same posture as `realtimekit.ts`: not
 * a storage abstraction written for an imaginary second provider, just
 * one place that knows the vendor, so swapping means rewriting this file
 * and nothing that stores a key.
 *
 * `R2_ENDPOINT` overrides the account endpoint for an S3-compatible
 * store — the same escape hatch the platform repo has for MinIO, and how
 * this pipeline is exercised end to end without spending R2 writes.
 */

export type PutResult = { key: string; bytes: number; sha256: string };

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT),
  );
}

/**
 * Copy one file in, and prove it arrived.
 *
 * Three separate claims, because "the request returned 200" is not one
 * of them: the bytes hash to what we downloaded (`sha256`, recorded on
 * the track row), the store's own ETag is the MD5 of the same bytes, and
 * a HEAD afterwards reports the same length. An object half-written is a
 * lesson we would later transcribe into nonsense.
 */
export async function putLessonAudio(args: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<PutResult> {
  if (args.body.length === 0) {
    // The provider has produced empty files before (an allowlist matching
    // nobody). Storing one would turn "we have the audio" into a lie that
    // survives every later check.
    throw new Error(`refusing to store an empty object at ${args.key}`);
  }

  const digest = sha256Hex(args.body);
  const md5 = createHash("md5").update(args.body).digest("hex");

  const response = await send({
    method: "PUT",
    key: args.key,
    payloadSha256: digest,
    headers: {
      "content-type": args.contentType,
      "content-length": String(args.body.length),
    },
    body: args.body,
  });
  if (!response.ok) {
    throw new Error(
      `R2 PUT ${args.key} failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
    );
  }

  const etag = response.headers.get("etag")?.replace(/^"|"$/g, "") ?? "";
  if (/^[0-9a-f]{32}$/i.test(etag) && etag.toLowerCase() !== md5) {
    throw new Error(
      `R2 stored ${args.key} with a different body — ETag ${etag} is not the MD5 of what we sent`,
    );
  }

  const stored = await headObject(args.key);
  if (stored === null) {
    throw new Error(`R2 accepted ${args.key} but it is not there afterwards`);
  }
  if (stored !== args.body.length) {
    throw new Error(
      `R2 stored ${stored} bytes at ${args.key}, expected ${args.body.length}`,
    );
  }

  return { key: args.key, bytes: args.body.length, sha256: digest };
}

/** The stored length, or null if the object is not there. */
export async function headObject(key: string): Promise<number | null> {
  const response = await send({
    method: "HEAD",
    key,
    payloadSha256: sha256Hex(""),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 HEAD ${key} failed (${response.status})`);
  }
  const length = response.headers.get("content-length");
  return length === null ? null : Number(length);
}

// ---------------------------------------------------------------------------

async function send(args: {
  method: string;
  key: string;
  payloadSha256: string;
  headers?: Record<string, string>;
  body?: Buffer;
}): Promise<Response> {
  const bucket = required("R2_BUCKET");
  const endpoint = (
    process.env.R2_ENDPOINT ??
    `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`
  ).replace(/\/+$/, "");

  const signed = signRequest({
    method: args.method,
    // Path-style: R2's endpoint is per-account and the bucket is the first
    // path segment. Virtual-host style would need a per-bucket hostname we
    // do not have.
    url: `${endpoint}/${bucket}/${args.key}`,
    region: process.env.R2_REGION ?? "auto",
    service: "s3",
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    payloadSha256: args.payloadSha256,
    headers: args.headers,
  });

  return fetch(signed.url, {
    method: args.method,
    headers: signed.headers,
    // A Node Buffer is not a `BodyInit` — its backing store is an
    // `ArrayBufferLike`, which may be shared. Copying into a plain
    // Uint8Array is what makes it one, and is cheap next to the network
    // hop it precedes.
    body: args.body ? new Uint8Array(args.body) : undefined,
    cache: "no-store",
  });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Loud and named. A storage layer that silently no-ops is how a
    // lesson gets marked ingested with nothing behind it.
    throw new Error(`${name} is not set — lesson audio storage is not configured`);
  }
  return value;
}
