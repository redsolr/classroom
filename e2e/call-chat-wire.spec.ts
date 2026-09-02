import { expect, test } from "@playwright/test";
import { decodeCallChat, encodeCallChat } from "../src/lib/call-chat-wire";

/**
 * THE IN-CALL BROADCAST, as pure logic — no browser, no room.
 *
 * What this guards is the one thing about in-call chat that is not
 * obvious: the wire is written by the OTHER PERSON'S BROWSER. Everything
 * arriving on it is a claim, so the decoder's job is to accept exactly
 * what we send and refuse everything else without taking the chat pane
 * down — a payload from a future version of this app, or from some other
 * feature sharing the meeting, is a normal thing to receive and ignore.
 *
 * The delivery itself is proven where it can only honestly be proven:
 * `lesson-call.live-call.spec.ts` puts a real message across a real room.
 */

const MESSAGE = {
  id: "9f3f6d2e-1f4c-4d0e-9a1e-6f2c9a7b1d34",
  body: "それは「お願いします」です",
  createdAt: "2026-08-31T09:15:00.000Z",
};

test("what we send is what the other side reads", () => {
  expect(decodeCallChat(encodeCallChat(MESSAGE))).toEqual(MESSAGE);
});

test("the wire carries no author, because direction is the attribution", () => {
  // There are two people in the room. A payload that could NAME its
  // author would let one of them post as the other in the live pane;
  // the durable row takes its author from the server instead.
  const encoded = JSON.parse(encodeCallChat(MESSAGE)) as Record<string, unknown>;
  expect(Object.keys(encoded).sort()).toEqual(["body", "createdAt", "id", "v"]);
});

test("anything we did not send is ignored rather than rendered", () => {
  for (const payload of [
    null,
    undefined,
    "",
    "not json at all",
    "[]",
    JSON.stringify("a string"),
    // A person typing into some other chat surface on the same meeting.
    JSON.stringify({ hello: "there" }),
    // A future version of this app talking to an older one.
    JSON.stringify({ v: 2, id: MESSAGE.id, body: "hi", createdAt: MESSAGE.createdAt }),
    // Right shape, missing pieces.
    JSON.stringify({ v: 1, id: MESSAGE.id, createdAt: MESSAGE.createdAt }),
    JSON.stringify({ v: 1, id: MESSAGE.id, body: "", createdAt: MESSAGE.createdAt }),
    JSON.stringify({ v: 1, id: 42, body: "hi", createdAt: MESSAGE.createdAt }),
    // A date that would render as "Invalid Date" — which reads as our
    // bug rather than as their bad payload.
    JSON.stringify({ v: 1, id: MESSAGE.id, body: "hi", createdAt: "whenever" }),
  ]) {
    expect(decodeCallChat(payload as string | null | undefined)).toBeNull();
  }
});
