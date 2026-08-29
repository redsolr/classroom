"use client";

import * as React from "react";

/** The clock is an external system: nothing to subscribe to, since the
 * greeting only has to be right when the page loads. */
const noop = () => () => {};

/**
 * "Good afternoon" — the learner's own clock, not the server's.
 *
 * Rendered on the server this would read the deploy region's time and be
 * wrong for most of the day, so the SERVER snapshot is time-NEUTRAL
 * ("Welcome back") and the client snapshot is the real hour. Same
 * useSyncExternalStore shape the vocab table uses for its stored column
 * choice: server render and hydration agree, then the truth applies. A
 * greeting that lies is worse than one that's generic.
 */
export function Greeting() {
  const hour = React.useSyncExternalStore(
    noop,
    () => new Date().getHours(),
    () => null,
  );

  if (hour === null) return <>Welcome back</>;
  if (hour < 5) return <>Still up?</>;
  if (hour < 12) return <>Good morning</>;
  if (hour < 18) return <>Good afternoon</>;
  return <>Good evening</>;
}
