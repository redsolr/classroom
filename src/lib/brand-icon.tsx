import { ImageResponse } from "next/og";

/**
 * Classroom brand tile — the CRM's brand-icon pattern. Dynamic favicon /
 * apple-icon routes render it; scripts/generate-pwa-icons.mjs bakes the
 * static manifest PNGs from the same recipe.
 */
export const BRAND_ICON = {
  background: "#5e5ce6",
  color: "#ffffff",
  letter: "C",
} as const;

export function renderBrandIcon({
  size,
  fontSize,
  borderRadius,
}: {
  size: number;
  fontSize: number;
  borderRadius: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize,
          background: BRAND_ICON.background,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: BRAND_ICON.color,
          borderRadius,
          fontWeight: 700,
        }}
      >
        {BRAND_ICON.letter}
      </div>
    ),
    { width: size, height: size },
  );
}
