"use client";

import { useTheme, type ThemeMode } from "@/stores/use-theme";
import { Card, CardHeader } from "@/components/ui/page-header";

/**
 * Theme picker — ThemeCard mini-preview pattern ported from web-app's
 * settings (`primitives.tsx`), recolored to classroom's palette.
 */

const PREVIEW = {
  light: { outer: "#f7f7f8", bar: "#e5e5ea", content: "#ffffff", line: "#e5e5ea" },
  dark: { outer: "#0e0e11", bar: "#26262d", content: "#17171b", line: "#26262d" },
} as const;

function PreviewHalf({ tone }: { tone: "light" | "dark" }) {
  const c = PREVIEW[tone];
  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <div className="h-full w-[30%]" style={{ backgroundColor: c.bar }} />
      <div
        className="flex flex-1 flex-col gap-1 p-1.5"
        style={{ backgroundColor: c.content }}
      >
        <div className="h-1.5 w-3/4 rounded-sm" style={{ backgroundColor: c.line }} />
        <div className="h-1.5 w-1/2 rounded-sm" style={{ backgroundColor: c.line }} />
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <div className="h-3 flex-1 rounded-sm" style={{ backgroundColor: c.line }} />
          <div className="size-3 rounded-sm bg-accent" />
        </div>
      </div>
    </div>
  );
}

function ThemeCard({
  mode,
  active,
  onClick,
}: {
  mode: ThemeMode;
  active: boolean;
  onClick: () => void;
}) {
  const labels: Record<ThemeMode, string> = {
    light: "Light",
    dark: "Dark",
    system: "Auto",
  };
  return (
    // Fluid width — the three cards split the row on every viewport
    // (fixed 120px cards left the third wrapping alone on phones with a
    // dead right half of the section).
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col items-center gap-2 transition-opacity ${
        active ? "opacity-100" : "opacity-60 hover:opacity-80"
      }`}
    >
      <div
        className={`aspect-[3/2] w-full overflow-hidden rounded-lg border-2 transition-colors ${
          active ? "border-accent" : "border-transparent"
        }`}
        style={{
          backgroundColor: PREVIEW[mode === "dark" ? "dark" : "light"].outer,
        }}
      >
        <div className="flex h-full">
          {mode === "system" ? (
            <>
              <PreviewHalf tone="light" />
              <PreviewHalf tone="dark" />
            </>
          ) : (
            <PreviewHalf tone={mode} />
          )}
        </div>
      </div>
      <span
        className={`text-[0.9375rem] ${active ? "font-medium text-fg" : "text-fg-secondary"}`}
      >
        {labels[mode]}
      </span>
    </button>
  );
}

export function AppearanceSection() {
  // Store state — hydrated from localStorage by ThemeInit on mount.
  const { mode, setMode } = useTheme();

  return (
    <Card className="max-w-2xl">
      <CardHeader title="Appearance" />
      <div className="px-4 py-4">
        <p className="mb-4 text-[0.9375rem] text-fg-secondary">
          How Classroom looks on this device. &ldquo;Auto&rdquo; follows your
          system setting.
        </p>
        <div className="grid max-w-md grid-cols-3 items-start gap-3 sm:gap-4">
          {(["light", "dark", "system"] as const).map((m) => (
            <ThemeCard
              key={m}
              mode={m}
              active={mode === m}
              onClick={() => setMode(m)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
