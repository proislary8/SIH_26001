import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "localhost:3001"],
    },
  },
  // No webpack() hook: Next 16 builds with Turbopack, so a webpack rule
  // here would never run. The MapLibre worker is served from
  // public/maplibre/ and wired up in lib/map/maplibre.ts instead.
};

export default nextConfig;

