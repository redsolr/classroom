"use client";

import * as React from "react";
import { loadStoredMode, resolveTheme, applyTheme } from "@/lib/theme";

/**
 * Theme lifecycle (pattern from web-app's ThemeInit): hydrates the stored
 * preference on mount and re-resolves on OS changes while the stored mode
 * is "system". Renders nothing.
 */
export function ThemeInit() {
  React.useEffect(() => {
    applyTheme(resolveTheme(loadStoredMode()));

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (loadStoredMode() === "system") {
        applyTheme(resolveTheme("system"));
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return null;
}
