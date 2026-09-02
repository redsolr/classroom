/**
 * WHAT IS OPEN IN A LESSON, BESIDE THE TWO FACES.
 *
 * Shared content is a TAB alongside the call, never a mode that replaces
 * it. That is the whole point of the shape: a screen share today, and a
 * deck or a book the two of them open together later, without the room
 * turning into a meeting app to accommodate either. A mode would mean
 * every new kind of shared thing fights the last one for the same frame.
 *
 * The lesson tab always exists and can never be closed — whatever else
 * is on screen, the two people are the reason for the call.
 *
 * Pure: no SDK, no React. The room decides WHEN something is shared;
 * this decides what that means for what you can look at.
 */

export type CallTabKind = "lesson" | "peer-screen" | "self-screen";

export type CallTab = {
  id: CallTabKind;
  label: string;
};

/**
 * The tabs available right now.
 *
 * Your OWN share gets a tab too, which sounds redundant until the first
 * time someone asks "can you see this?" — it is the only place that
 * answers what the other person is actually being shown.
 */
export function buildCallTabs(state: {
  peerSharing: boolean;
  selfSharing: boolean;
  otherName: string;
}): CallTab[] {
  const tabs: CallTab[] = [{ id: "lesson", label: "Lesson" }];
  if (state.peerSharing) {
    tabs.push({ id: "peer-screen", label: `${state.otherName}'s screen` });
  }
  if (state.selfSharing) {
    tabs.push({ id: "self-screen", label: "Your screen" });
  }
  return tabs;
}

/**
 * The tab actually shown, given the one that was asked for.
 *
 * A share ending takes its tab with it, and whoever was looking at it
 * lands back on the lesson rather than on a blank frame. Falling back to
 * the lesson is always safe because it is the one tab that cannot go
 * away.
 */
export function resolveActiveTab(
  requested: CallTabKind,
  tabs: CallTab[],
): CallTabKind {
  return tabs.some((tab) => tab.id === requested) ? requested : "lesson";
}

/**
 * Should the view follow a share that just started?
 *
 * Yes when THEY start sharing — they put something up to be looked at,
 * and making the other person hunt for a tab to see it is the kind of
 * friction that ends with "can you see my screen?" twice a lesson.
 *
 * No when YOU start sharing: you are already looking at the thing you
 * shared, and switching would replace the other person's face with a
 * panel about your own screen at the exact moment you started presenting
 * to them.
 *
 * Only on the TRANSITION, so someone who deliberately clicks back to the
 * lesson while a share continues stays there.
 */
export function shouldFollowShare(previous: boolean, next: boolean): boolean {
  return !previous && next;
}
