import type { NextConfig } from "next";
import path from "path";

// Derived from Next's own signature — `webpack` is bundled inside Next and
// is not a declared dependency here, so importing its types directly fails.
type WebpackConfig = Parameters<NonNullable<NextConfig["webpack"]>>[0];

const nextConfig: NextConfig = {
  // ArcGIS Core SDK uses ESM — must be transpiled for App Router
  transpilePackages: ["@arcgis/core"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "localhost:3001"],
    },
  },
  webpack(config: WebpackConfig) {
    // maplibre-gl v6 uses new URL(worker, import.meta.url) for Web Workers.
    config.module = config.module ?? {};
    config.module.rules = config.module.rules ?? [];
    config.module.rules.push({
      test: /maplibre-gl[/\\]dist[/\\].+worker\.js$/,
      type: "asset/resource",
    });
    // ArcGIS Core: exclude from server bundle (client-only)
    config.module.rules.push({
      test: /@arcgis\/core/,
      sideEffects: false,
    });
    return config;
  },
};

export default nextConfig;

