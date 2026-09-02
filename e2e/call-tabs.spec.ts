import { expect, test } from "@playwright/test";
import {
  buildCallTabs,
  resolveActiveTab,
  shouldFollowShare,
} from "../src/lib/call-tabs";

/**
 * WHAT IS OPEN IN A LESSON — pure logic, no browser.
 *
 * The tab strip is the frame that lets shared content exist without the
 * room becoming a meeting app: a screen today, a deck the two of them
 * open together later. What is worth testing is not the strip's markup
 * but its rules, because each one is a way the room could strand
 * somebody: on a tab whose content just ended, on a face they can no
 * longer see, or on a lesson they have to hunt through to find the thing
 * the other person just put up.
 */

const OTHER = "Kenji";

test("a lesson with nothing shared has nothing to switch between", () => {
  const tabs = buildCallTabs({
    peerSharing: false,
    selfSharing: false,
    otherName: OTHER,
  });
  // One tab renders no strip at all (`call-tabs.tsx`): chrome announcing
  // that the lesson is the lesson.
  expect(tabs).toEqual([{ id: "lesson", label: "Lesson" }]);
});

test("each share adds a tab, and the lesson keeps its place first", () => {
  expect(
    buildCallTabs({ peerSharing: true, selfSharing: true, otherName: OTHER }),
  ).toEqual([
    { id: "lesson", label: "Lesson" },
    { id: "peer-screen", label: "Kenji's screen" },
    // Your own share gets a tab too — the only place that answers "can
    // you see this?".
    { id: "self-screen", label: "Your screen" },
  ]);
});

test("a share ending puts you back in the lesson, never on a dead frame", () => {
  const sharing = buildCallTabs({
    peerSharing: true,
    selfSharing: false,
    otherName: OTHER,
  });
  expect(resolveActiveTab("peer-screen", sharing)).toBe("peer-screen");

  const stopped = buildCallTabs({
    peerSharing: false,
    selfSharing: false,
    otherName: OTHER,
  });
  expect(resolveActiveTab("peer-screen", stopped)).toBe("lesson");
  // The lesson tab cannot go away, which is what makes it always a safe
  // place to land.
  expect(resolveActiveTab("lesson", stopped)).toBe("lesson");
});

test("the view follows a share when it starts, and only then", () => {
  // They put something up to be looked at.
  expect(shouldFollowShare(false, true)).toBe(true);
  // Still sharing. Someone who clicked back to the lesson stays there —
  // a view that keeps yanking itself back is worse than one that waits.
  expect(shouldFollowShare(true, true)).toBe(false);
  expect(shouldFollowShare(true, false)).toBe(false);
  expect(shouldFollowShare(false, false)).toBe(false);
});
