import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { THEME_PRE_HYDRATION_SCRIPT } from "@/lib/theme";
import { ThemeInit } from "@/components/theme/theme-init";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Class-room",
    template: "%s · Class-room",
  },
  description:
    "The private memory and lesson workflow of an independent language teacher.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the pre-hydration script stamps data-theme
    // + a theme class on <html> before React hydrates.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_PRE_HYDRATION_SCRIPT }} />
      </head>
      <body>
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}
