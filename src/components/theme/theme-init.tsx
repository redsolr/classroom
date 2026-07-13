"use client";

import * as React from "react";
import { loadStoredMode } from "@/lib/theme";
import { useThemeStore } from "@/stores/theme.store";

/**
 * Theme lifecycle (pattern from web-app's ThemeInit): hydrates the stored
 * preference into the store on mount, and re-resolves on OS-preference
 * changes while the chosen mode is "system". Renders nothing.
 */
export function ThemeInit() {
  React.useEffect(() => {
    const { setMode } = useThemeStore.getState();
    setMode(loadStoredMode());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (useThemeStore.getState().mode === "system") {
        setMode("system");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return null;
}
