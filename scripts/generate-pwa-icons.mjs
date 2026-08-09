/**
 * Bake the static manifest PNGs (public/icons/*) from the same recipe as
 * src/lib/brand-icon.tsx, using Playwright's bundled Chromium — no image
 * tooling required. Re-run only when the brand tile changes:
 *
 *   node scripts/generate-pwa-icons.mjs
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const OUT = join(process.cwd(), "public", "icons");
mkdirSync(OUT, { recursive: true });

const BACKGROUND = "#5e5ce6";
const COLOR = "#ffffff";
const LETTER = "C";

/** maskable: content inside the 80% safe zone, square-bled background. */
const TILES = [
  { file: "icon-192.png", size: 192, radius: "20%", scale: 0.6 },
  { file: "icon-512.png", size: 512, radius: "20%", scale: 0.6 },
  { file: "icon-maskable-512.png", size: 512, radius: "0", scale: 0.45 },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const tile of TILES) {
  await page.setViewportSize({ width: tile.size, height: tile.size });
  await page.setContent(`
    <body style="margin:0">
      <div style="width:${tile.size}px;height:${tile.size}px;background:${BACKGROUND};
                  border-radius:${tile.radius};display:flex;align-items:center;
                  justify-content:center;color:${COLOR};font-weight:700;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:${Math.round(tile.size * tile.scale)}px">
        ${LETTER}
      </div>
    </body>`);
  await page.screenshot({
    path: join(OUT, tile.file),
    omitBackground: tile.radius !== "0",
  });
  console.log(`wrote public/icons/${tile.file}`);
}

await browser.close();
