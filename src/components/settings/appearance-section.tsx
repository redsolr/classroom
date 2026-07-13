"use client";

import * as React from "react";
import {
  loadStoredMode,
  setThemeMode,
  type ThemeMode,
} from "@/lib/theme";
import { Card, CardHeader } from "@/components/ui/page-header";

/**
 * Theme picker — ThemeCard mini-preview pattern ported from web-app's
 * settings (`primitives.tsx`), recolored to class-room's palette.
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
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 transition-opacity ${
        active ? "opacity-100" : "opacity-60 hover:opacity-80"
      }`}
    >
      <div
        className={`h-[80px] w-[120px] overflow-hidden rounded-lg border-2 transition-colors ${
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
  const [mode, setMode] = React.useState<ThemeMode | null>(null);

  // Hydrate the stored preference after mount (SSR renders no selection).
  React.useEffect(() => {
    setMode(loadStoredMode());
  }, []);

  function choose(next: ThemeMode) {
    setMode(next);
    setThemeMode(next);
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader title="Appearance" />
      <div className="px-4 py-4">
        <p className="mb-4 text-[0.9375rem] text-fg-secondary">
          How Class-room looks on this device. &ldquo;Auto&rdquo; follows your
          system setting.
        </p>
        <div className="flex items-start gap-6">
          {(["light", "dark", "system"] as const).map((m) => (
            <ThemeCard
              key={m}
              mode={m}
              active={mode === m}
              onClick={() => choose(m)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
