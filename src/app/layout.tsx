import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Inter,
  Kalam,
  Klee_One,
  Patrick_Hand,
  Shantell_Sans,
  Yomogi,
} from "next/font/google";
import { THEME_PRE_HYDRATION_SCRIPT } from "@/lib/theme";
import { ThemeInit } from "@/components/theme/theme-init";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

/**
 * Handwriting faces for the notebook spike.
 *
 * Latin hands carry the variation: each is loaded so the sheet can turn
 * on `calt` and let the FONT cycle glyph shapes, which is what stops
 * every "a" on a page being identical without a single extra DOM node.
 *
 * Klee One is the Japanese pen hand, and it is not optional garnish: a
 * Latin handwriting font has no kana or kanji, so a mixed EN/JA line
 * would fall back to Yu Gothic mid-sentence and read as two documents
 * stapled together. It sits AFTER the Latin hand in the stack, so the
 * browser resolves it per character — Latin from the hand, Japanese from
 * Klee — with no unicode-range bookkeeping of our own.
 */
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" });
const kalam = Kalam({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-kalam",
});
const patrickHand = Patrick_Hand({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-patrick",
});
const shantellSans = Shantell_Sans({
  subsets: ["latin"],
  variable: "--font-shantell",
});
// No `subsets` and `preload: false` — deliberate, and the only correct
// shape for a CJK face. next/font demands a subset list only when it is
// going to emit <link rel=preload>, and preloading a Japanese font is
// meaningless: Google slices it into ~250 unicode-range files and the
// browser fetches the handful the page actually uses. Naming a subset
// here would also be a type error, because next/font's generated types
// for these families list only the Latin-ish subsets.
const yomogi = Yomogi({
  weight: ["400"],
  preload: false,
  variable: "--font-yomogi",
});
const kleeOne = Klee_One({
  weight: ["400"],
  preload: false,
  variable: "--font-klee",
});

const FONT_VARIABLES = [
  inter.variable,
  caveat.variable,
  kalam.variable,
  patrickHand.variable,
  shantellSans.variable,
  kleeOne.variable,
  yomogi.variable,
].join(" ");

export const metadata: Metadata = {
  title: {
    default: "Classroom",
    template: "%s · Classroom",
  },
  description:
    "The private memory and lesson workflow of an independent language teacher.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Classroom",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e11" },
  ],
  /**
   * Shrink the LAYOUT viewport when the keyboard opens, not just the
   * visual one. Without this, `position: fixed; bottom: 0` keeps being
   * measured against a viewport the keyboard is covering, which is why
   * the phone tab bar ended up in the MIDDLE of the screen, sitting on
   * top of the keyboard. This is the real fix wherever it is supported
   * (Chrome on Android); Safari does not implement it, and
   * `lib/use-keyboard-open.ts` covers that side by standing the bar down
   * while typing — which is the native behaviour on both anyway.
   */
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the pre-hydration script stamps data-theme
    // + a theme class on <html> before React hydrates.
    <html lang="en" className={FONT_VARIABLES} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_PRE_HYDRATION_SCRIPT }} />
      </head>
      <body>
        <ThemeInit />
        {children}
        {/* One toast layer for the whole app — see components/ui/toaster. */}
        <Toaster />
      </body>
    </html>
  );
}
