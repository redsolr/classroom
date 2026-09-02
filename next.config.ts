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
  //
  // The `.ts.net` name is the one a PHONE needs to test a CALL. Camera
  // and microphone only work in a SECURE CONTEXT, and the single
  // exception browsers make is `http://localhost` — which on a phone
  // means the phone. So the Tailscale IP below renders the app and then
  // fails at the device preview, while `tailscale serve` puts a real
  // certificate in front of the same dev server and works. Both are
  // listed because the IP is still the quicker way to look at a page
  // that needs no camera. See README § "Testing on a phone".
  allowedDevOrigins: ["100.70.14.13", "desktop-euq1qho.tail92718a.ts.net"],
  // The dev-tools badge is pinned to the bottom edge of the viewport,
  // which is exactly where the phone quick-access bar now lives — on a
  // 390px screen it sits ON the Home tab and swallows the tap. It costs
  // us nothing (it's a dev-only affordance we never use) and it would
  // have annoyed the founder's dev phone run the same way it broke the
  // mobile spec.
  devIndicators: false,
  // URLs speak the product's OWN vocabulary (2026-08-29). The routes were
  // the last place the pre-naming-pass words survived: the UI said Books,
  // Decks, Official and Reading list while the address bar still said
  // /vocab, /vocab/review, /packs and /library. "One word, one meaning"
  // has to include the URL — it is the most public name a page has.
  //
  //   /vocab → /books        /vocab/review → /decks
  //   /packs → /official     /library      → /reading
  //
  // Every old path keeps working (the /study prefix from the 2026-08-12
  // move included). Query strings ride along automatically, so
  // /vocab/review?book=<id> lands on /decks?book=<id>. Non-permanent on
  // purpose: a 308 is cached by browsers indefinitely and would outlive
  // our ability to change our minds.
  async redirects() {
    return [
      { source: "/study", destination: "/chat", permanent: false },
      { source: "/study/:path*", destination: "/:path*", permanent: false },
      // Longest first — /vocab/review must not fall through to /books.
      { source: "/vocab/review", destination: "/decks", permanent: false },
      {
        source: "/vocab/export.csv",
        destination: "/books/export.csv",
        permanent: false,
      },
      { source: "/vocab", destination: "/books", permanent: false },
      {
        source: "/vocab/:path*",
        destination: "/books/:path*",
        permanent: false,
      },
      { source: "/packs", destination: "/official", permanent: false },
      {
        source: "/packs/:path*",
        destination: "/official/:path*",
        permanent: false,
      },
      { source: "/library", destination: "/reading", permanent: false },
      {
        source: "/library/:path*",
        destination: "/reading/:path*",
        permanent: false,
      },
    ];
  },
  // Agents connect to the clean /mcp URL; mcp-handler requires the
  // [transport] segment underneath. Same arrangement as the CRM.
  async rewrites() {
    return [{ source: "/mcp", destination: "/api/mcp/mcp" }];
  },
};

export default nextConfig;
