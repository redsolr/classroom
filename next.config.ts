import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drizzle + postgres-js run in route handlers / server actions only.
  serverExternalPackages: ["postgres"],
  // The study surface moved off the /study prefix (2026-08-12): the chat
  // window lives at /chat and the other pages at the root (/vocab,
  // /library, …). Installed PWAs still launch start_url=/study and old
  // links live in bookmarks — keep them working; non-permanent so the
  // mapping can evolve.
  async redirects() {
    return [
      { source: "/study", destination: "/chat", permanent: false },
      { source: "/study/:path*", destination: "/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
