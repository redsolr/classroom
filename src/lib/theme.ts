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
 * **"dark" since 2026-08-29.** It was "light", on the reasoning that
 * classroom's users are teachers rather than developers and light reads
 * friendlier to that audience. What actually shipped since is a study
 * product whose visual identity IS artwork — generated book covers,
 * tankōbon spines, the liked tile, language-tinted review cards — and
 * cover art on a white page looks like a spreadsheet with pictures in
 * it. Light and OS-following stay one tap away in Settings →
 * Appearance, and a stored preference always wins over this.
 */
export const DEFAULT_THEME_MODE = "dark" as ThemeMode;

/** HTML attribute set on `<html>` so CSS can branch on `[data-theme=…]`. */
const THEME_DOM_ATTR = "data-theme";

const THEME_CSS_CLASSES = ["light", "dark"] as const;

// ─── Pure resolution ────────────────────────────────────────────────────────

/** The app's own answer when there is nothing better — the resolved form
 * of DEFAULT_THEME_MODE, used for SSR and when matchMedia is unavailable. */
const FALLBACK_THEME: ResolvedTheme =
  // `as ThemeMode` on the constant keeps it a union rather than the
  // literal it happens to hold today, so this stays a real branch that
  // follows the default instead of a comparison TypeScript can fold away.
  DEFAULT_THEME_MODE === "light" ? "light" : "dark";

/** SSR-safe: `system` can't be resolved without a window, so it falls back
 * to the app default rather than to a hard-coded side of the switch. */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  if (typeof window === "undefined") return FALLBACK_THEME;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
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

export const THEME_PRE_HYDRATION_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'${DEFAULT_THEME_MODE}';var r;if(t==='light')r='light';else if(t==='system')r=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';else r='${FALLBACK_THEME}';document.documentElement.setAttribute('${THEME_DOM_ATTR}',r);document.documentElement.classList.add(r)}catch(e){}})()`;
