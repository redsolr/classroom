/**
 * Theme primitives — single source of truth for everything theme-related.
 * Architecture ported from Jurisimus web-app (`src/lib/theme.ts`):
 *
 *   - This file is **pure**: no React, no module-level side effects. It can
 *     be imported from anywhere (server components, client components, the
 *     inline pre-hydration script).
 *   - `src/components/theme/theme-init.tsx` owns mount-time hydration and
 *     the matchMedia listener.
 *   - The inline `<script>` in the root layout uses
 *     `THEME_PRE_HYDRATION_SCRIPT`, generated from the same constants — no
 *     hand-mirrored JS that can drift.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** What the user has chosen. `system` follows OS preference at resolution time. */
export type ThemeMode = "system" | "light" | "dark";

/** What we actually paint. Resolution turns `system` into one of these. */
export type ResolvedTheme = "light" | "dark";

// ─── Constants ──────────────────────────────────────────────────────────────

/** localStorage key. Don't change without a migration — drops users' prefs. */
export const THEME_STORAGE_KEY = "classroom-theme";

/**
 * What new visitors get on first paint when they have no stored preference.
 *
 * "light", deliberately (the inverse of web-app's choice): class-room's
 * users are teachers, not developers — light UIs read as friendlier and
 * more familiar to this audience. Dark and OS-following are opt-in via
 * Settings → Appearance.
 */
export const DEFAULT_THEME_MODE: ThemeMode = "light";

/** HTML attribute set on `<html>` so CSS can branch on `[data-theme=…]`. */
const THEME_DOM_ATTR = "data-theme";

const THEME_CSS_CLASSES = ["light", "dark"] as const;

// ─── Pure resolution ────────────────────────────────────────────────────────

/** SSR-safe: `system` falls back to light on the server. */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

// ─── localStorage I/O ───────────────────────────────────────────────────────

export function loadStoredMode(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME_MODE;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return DEFAULT_THEME_MODE;
}

export function saveStoredMode(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
}

// ─── DOM mutation ───────────────────────────────────────────────────────────

/** The ONLY function that touches `data-theme` / theme classes on `<html>`
 *  (the pre-hydration script hard-codes the equivalent — it runs before
 *  modules exist). */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute(THEME_DOM_ATTR, resolved);
  root.classList.remove(...THEME_CSS_CLASSES);
  root.classList.add(resolved);
}

// ─── Pre-hydration script ───────────────────────────────────────────────────
// Injected as an inline <script> in the root layout; runs before React
// hydrates so the page never flashes the wrong theme. Constants are baked
// in via template interpolation at module load — single source of truth.

export const THEME_PRE_HYDRATION_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'${DEFAULT_THEME_MODE}';var r;if(t==='dark')r='dark';else if(t==='system')r=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';else r='light';document.documentElement.setAttribute('${THEME_DOM_ATTR}',r);document.documentElement.classList.add(r)}catch(e){}})()`;
