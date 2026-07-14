import { randomBytes } from "node:crypto";

/**
 * URL-safe bearer token for recap links, student portals, and account
 * claims. 18 bytes → 24 base64url chars; the token in the URL is the
 * sole authorization, so entropy is the security boundary.
 */
export function generateAccessToken(): string {
  return randomBytes(18).toString("base64url");
}
