import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drizzle + postgres-js run in route handlers / server actions only.
  serverExternalPackages: ["postgres"],
  // Dev-only. Next refuses cross-origin requests to /_next/* dev
  // resources, so opening the dev server on this machine's NETWORK
  // address (the founder phone run — Next prints it as "Network:" at
  // boot) renders the page but gets HMR blocked, and edits stop showing
  // up. List a device origin here to develop against it. No effect on a
  // production build.
  allowedDevOrigins: ["100.70.14.13"],
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
