/**
 * Theme store — pure Zustand state for the user's chosen theme mode.
 * Architecture ported from web-app's `stores/theme.store.ts`.
 *
 * Pure means: no module-level side effects. Constructing this store doesn't
 * touch the DOM, doesn't read localStorage, doesn't register listeners —
 * that happens in `src/components/theme/theme-init.tsx`, which owns the
 * lifecycle. The store starts with the default mode (light); on the
 * browser, ThemeInit dispatches `setMode(loadStoredMode())` once on mount.
 *
 * Every state change goes through `setMode`; it is the single write path
 * (persist + apply + state in one atomic step).
 */

import { create } from "zustand";
import {
  DEFAULT_THEME_MODE,
  applyTheme,
  resolveTheme,
  saveStoredMode,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/theme";

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: DEFAULT_THEME_MODE,
  resolved: resolveTheme(DEFAULT_THEME_MODE),
  setMode: (mode) => {
    const resolved = resolveTheme(mode);
    saveStoredMode(mode);
    applyTheme(resolved);
    set({ mode, resolved });
  },
}));

export type { ThemeMode };
