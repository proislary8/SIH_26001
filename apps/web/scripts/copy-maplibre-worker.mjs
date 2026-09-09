/**
 * Copy MapLibre's worker bundle into public/maplibre/.
 *
 * MapLibre parses GeoJSON off the main thread. Turbopack does not emit that
 * worker for us, so it is served as a static asset and pointed at with
 * setWorkerUrl() in lib/map/maplibre.ts. Running this before dev and build
 * keeps the copy in step with the installed maplibre-gl version — a stale
 * copy would break every GeoJSON layer silently.
 */
import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

try {
  const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
  const out = join(process.cwd(), "public", "maplibre");
  await mkdir(out, { recursive: true });

  for (const file of FILES) {
    await copyFile(join(dist, file), join(out, file));
  }
  console.log(`✓ maplibre worker synced (${FILES.length} files)`);
} catch (err) {
  // Never fail the build over this — but say so loudly, because the maps
  // will render without any GeoJSON layers if the copy is missing.
  console.error("✗ Could not sync the MapLibre worker:", err.message);
  console.error("  Maps will render basemaps but no risk zones or roads.");
  process.exitCode = 0;
}
