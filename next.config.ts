import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drizzle + postgres-js run in route handlers / server actions only.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
