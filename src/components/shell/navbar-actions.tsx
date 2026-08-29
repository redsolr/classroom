"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/** The slot in the mobile top bar (sidebar-shell) that a page fills with
 * its own quick actions — ChatGPT keeps per-chat options in the top bar
 * on phones instead of a second chrome row. */
export const NAVBAR_ACTIONS_SLOT_ID = "mobile-navbar-actions-slot";

/** Portals its children into the mobile navbar's actions slot. The slot
 * lives inside the `lg:hidden` navbar, so on desktop the content simply
 * stays hidden with it. */
export function NavbarActions({ children }: { children: React.ReactNode }) {
  // Null on the server snapshot, the slot element on the client — the
  // element reference is stable for the page's lifetime, so the
  // subscribe is a no-op (same pattern as study-chat's ttsSupported).
  const slot = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    () => document.getElementById(NAVBAR_ACTIONS_SLOT_ID),
    () => null,
  );

  return slot ? createPortal(children, slot) : null;
}
