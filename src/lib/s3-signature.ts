import { createHash, createHmac } from "node:crypto";

/**
 * SIGNING A REQUEST TO OUR OWN BUCKET.
 *
 * No AWS anywhere: this is Cloudflare R2, which speaks the S3 HTTP API,
 * and "Signature Version 4" is simply the name of the signature scheme
 * that API uses — Cloudflare's own R2 docs tell you to sign this way.
 * The credential is an R2 API token; nothing here reaches an AWS account
 * and no AWS package is installed.
 *
 * Why hand-written rather than `@aws-sdk/client-s3`: this app makes
 * exactly two requests against object storage (PUT one file, HEAD it
 * back), and the SDK is a large dependency tree to carry into every
 * serverless function for two verbs. The same judgement the webhook
 * route already made when it verified an RSA signature with WebCrypto
 * instead of adding a JOSE library.
 *
 * The trade is that this has to be RIGHT, so it is: (a) a fixed,
 * published algorithm rather than a guess, (b) checked in
 * `e2e/lesson-ingest.spec.ts` against AWS's own published test vector,
 * and (c) proven against a real S3 implementation before it shipped.
 * A signer that is subtly wrong fails closed — the store rejects the
 * request — which is the one failure mode we can live with.
 *
 * Deliberately unimplemented: query-string (presigned) signing, chunked
 * uploads, session tokens. Nothing here needs them, and an unused code
 * path in a signing routine is a place for bugs to hide.
 */

const ALGORITHM = "AWS4-HMAC-SHA256";

export type SignedRequest = { url: string; headers: Record<string, string> };

export function sha256Hex(body: Buffer | string): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Sign a request with the credential in the Authorization header.
 *
 * `payloadSha256` is passed in rather than computed from a body, because
 * the ingest hashes the bytes ONCE and uses the same digest for three
 * things: the signature, the integrity record on the track row, and the
 * comparison after the store hands the object back.
 */
export function signRequest(args: {
  method: string;
  url: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadSha256: string;
  headers?: Record<string, string>;
  now?: Date;
}): SignedRequest {
  const url = new URL(args.url);
  const now = args.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${args.region}/${args.service}/aws4_request`;

  const headers: Record<string, string> = {
    ...(args.headers ?? {}),
    host: url.host,
    "x-amz-content-sha256": args.payloadSha256,
    "x-amz-date": amzDate,
  };

  // Canonical headers: lowercased names, sorted, values trimmed and with
  // internal runs of whitespace collapsed.
  const canonicalEntries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaders = canonicalEntries.map(([name]) => name).join(";");
  const canonicalHeaders = canonicalEntries
    .map(([name, value]) => `${name}:${value}\n`)
    .join("");

  const canonicalRequest = [
    args.method.toUpperCase(),
    canonicalPath(url.pathname),
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    args.payloadSha256,
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hmac(
    signingKey(args.secretAccessKey, dateStamp, args.region, args.service),
    stringToSign,
  ).toString("hex");

  return {
    url: url.toString(),
    headers: {
      ...headers,
      Authorization:
        `${ALGORITHM} Credential=${args.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function signingKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const date = hmac(Buffer.from(`AWS4${secret}`, "utf8"), dateStamp);
  const regionKey = hmac(date, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, "aws4_request");
}

function hmac(key: Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

/**
 * Each path segment encoded once, per RFC 3986.
 *
 * S3 is the documented exception to double-encoding: the path is signed
 * as it appears on the wire. Object keys in this app are built from
 * uuids and provider file names, so nothing here needs escaping today —
 * the encoder exists so that the first key containing a space does not
 * silently start failing signature checks.
 */
function canonicalPath(pathname: string): string {
  return (
    pathname
      .split("/")
      .map((segment) => rfc3986(decodeURIComponent(segment)))
      .join("/") || "/"
  );
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .map(([key, value]) => [rfc3986(key), rfc3986(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
